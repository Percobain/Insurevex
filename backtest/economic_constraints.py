"""Deterministic design constraints, not a calibrated forecast or live engine.

Run: python3 backtest/economic_constraints.py
The netted waterfall is a candidate design, NOT the deployed contract's rule.
"""
import json
import math


def floor_budget(face, locked_growth, actual_growth, fees=0.0):
    """Growth is maturity cash received per initial dollar, after asset costs.

    locked_growth must be backed by a maturity-matched asset commitment to
    support protection; an estimated floating APY does not establish it.
    actual_growth is an explicit scenario, not automatically locked_growth.
    """
    if not all(math.isfinite(x) for x in (face, locked_growth, actual_growth, fees)):
        raise ValueError("finite inputs required")
    if face <= 0 or locked_growth <= 0 or actual_growth < 0 or fees < 0:
        raise ValueError("invalid budget")
    floor_cost = face / locked_growth
    risk_budget = face - floor_cost - fees
    floor_cash = floor_cost * actual_growth
    return dict(face=face, floor_cost=floor_cost, risk_budget=risk_budget,
                budget_feasible=risk_budget >= 0, floor_cash_at_maturity=floor_cash,
                shortfall_if_risk_sleeve_wiped=max(face - floor_cash, 0))


def settle_candidate(senior, pro, premium, claims, pro_profit_share, costs=0.0):
    """Candidate: settle a closed book and its costs BEFORE splitting net profit.

    Negative net results hit Pro first; a profitable closed book cannot charge
    Pro principal while simultaneously distributing profit to senior.
    Unsettled premiums must not be treated as distributable profit.
    """
    values = (senior, pro, premium, claims, pro_profit_share, costs)
    if not all(math.isfinite(x) for x in values):
        raise ValueError("finite inputs required")
    if min(senior, pro, premium, claims, costs) < 0 or not 0 <= pro_profit_share <= 1:
        raise ValueError("invalid account or allocation")
    if claims + costs > senior + pro + premium:
        raise ValueError("insolvent book: insufficient cash")
    net = premium - claims - costs
    if net >= 0:
        if pro == 0 and pro_profit_share > 0:
            raise ValueError("cannot allocate profit to absent Pro capital")
        pro_end = pro + pro_profit_share * net
        senior_end = senior + (1 - pro_profit_share) * net
    else:
        pro_loss = min(-net, pro)
        pro_end = pro - pro_loss
        senior_end = senior - (-net - pro_loss)
    assert math.isclose(senior_end + pro_end, senior + pro + premium - claims - costs)
    return dict(net_book_profit=net, senior_end=senior_end, pro_end=pro_end,
                senior_profit=senior_end - senior, pro_profit=pro_end - pro)


def funded_hedged_floor(face, principal_asset_ask_per_face, expense_escrow,
                       retail_notional, stock_spot, deductible,
                       matching_put_ask_per_share, incremental_costs, required_margin,
                       utilisation=1.0):
    """Quote constraint for an EXACTLY matching same-currency European put.

    Inputs must be actual funded/executable amounts in a live implementation.
    This reference does not fetch quotes, assert hedge ownership, or validate
    expiry, settlement basis, custody, or market availability.
    """
    inputs = (face, principal_asset_ask_per_face, expense_escrow, retail_notional,
              stock_spot, deductible, matching_put_ask_per_share, incremental_costs,
              required_margin, utilisation)
    if not all(math.isfinite(x) for x in inputs):
        raise ValueError("finite inputs required")
    if min(face, principal_asset_ask_per_face, retail_notional, stock_spot) <= 0:
        raise ValueError("positive face, asset price, notional and stock price required")
    if min(expense_escrow, matching_put_ask_per_share, incremental_costs, required_margin) < 0:
        raise ValueError("negative cost or margin")
    if not 0 <= deductible < 1 or not 0 < utilisation <= 1:
        raise ValueError("invalid coverage or utilisation")
    floor_purchase = face * principal_asset_ask_per_face
    risk_cash = face - floor_purchase - expense_escrow
    maximum_claim = retail_notional * (1 - deductible)
    if risk_cash < 0 or maximum_claim > utilisation * risk_cash:
        raise ValueError("insufficient separately funded risk cash; reject cover")
    shares = retail_notional / stock_spot
    hedge_cost = shares * matching_put_ask_per_share
    premium_minimum = hedge_cost + incremental_costs + required_margin
    return dict(principal_purchase=floor_purchase, expense_escrow=expense_escrow,
                risk_cash=risk_cash, maximum_claim=maximum_claim, shares=shares,
                strike=stock_spot * (1 - deductible), hedge_cost=hedge_cost,
                minimum_retail_premium=premium_minimum,
                matched_settlement_margin=required_margin)


def main():
    print(json.dumps({
        "scope": "Illustrative design scenarios; no historical profitability claim",
        "floor_promised_12pct_but_realises_zero": floor_budget(1000, 1.12, 1),
        "floor_delivers_promised_maturity_cash": floor_budget(1000, 1.12, 1.12),
        "candidate_profitable_book": settle_candidate(1000, 500, 100, 80, .7),
        "candidate_losing_book": settle_candidate(1000, 500, 100, 180, .7),
        "candidate_wipes_pro": settle_candidate(1000, 500, 100, 700, .7),
    }, indent=2))


if __name__ == "__main__":
    main()
