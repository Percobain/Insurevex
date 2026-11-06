import unittest

import numpy as np
import pandas as pd

from principal_research import bill_growth, bill_path, empirical_fair, pricing, run_account


class PrincipalResearchTest(unittest.TestCase):
    def test_bill_discount_uses_face_and_360_days(self):
        # $100 face at 4% discount and 91 days costs $98.9888889.
        self.assertAlmostEqual(bill_growth(.04), 100 / (100 - 4 * 91 / 360))
        self.assertNotAlmostEqual(bill_growth(.04), (1.04) ** (91 / 365), places=6)

    def test_future_rate_cannot_change_already_purchased_bill(self):
        dates = pd.date_range("1999-01-01", "2003-01-01")
        rates = pd.Series(.04, index=dates)
        first = bill_path(rates, "2000-01-01", pd.Timestamp("2001-01-01"))
        rates.loc["2000-01-02":] = 0
        second = bill_path(rates, "2000-01-01", pd.Timestamp("2001-01-01"))
        self.assertEqual(first[0]["interest"], second[0]["interest"])
        self.assertEqual(second[1]["interest"], 0)

    def test_exact_empirical_price_matches_direct_payoff(self):
        z = np.sort(np.array([-200., -5., -2., -.5, 0, 1, 5]))
        sigma = np.array([.01, .03, .1, .5])
        for b, c in [(0, 1), (.03, .1), (.1, .9)]:
            actual = empirical_fair(z, sigma, b, c)
            expected = np.clip(-b - sigma[:, None] * z, 0, c).mean(1)
            np.testing.assert_allclose(actual, expected, atol=1e-12)

    def test_future_crash_does_not_change_prior_quotes(self):
        dates = pd.date_range("2000-01-07", periods=20, freq="W-FRI")
        rng = np.random.default_rng(3)
        P = dict(dates=dates, market=np.array(["US"] * 60),
                 g=rng.normal(0, .03, (20, 60)), sd=np.full((20, 60), .02),
                 eligible=np.ones((20, 60), bool), known=np.ones((20, 60), bool))
        original = pricing(P, .03, .1)
        changed = dict(P, g=P["g"].copy())
        changed["g"][15:] = -.99
        altered = pricing(changed, .03, .1)
        np.testing.assert_allclose(original["fee"][:17], altered["fee"][:17], equal_nan=True)

    def test_all_policies_maximum_claim_cannot_access_principal(self):
        dates = pd.date_range("2000-01-07", "2003-01-01", freq="W-FRI")
        P = dict(dates=dates)
        product = dict(sold=np.ones(len(dates)), premium=np.zeros(len(dates)),
                       claims=np.ones(len(dates)), missing_claim_weight=np.zeros(len(dates)), c=.1)
        rate = pd.Series(.04, index=pd.date_range("1999-01-01", "2003-01-01"))
        curve = pd.DataFrame({f"SVENY{i:02d}": [4.] for i in range(1, 31)}, index=[pd.Timestamp("1999-12-01")])
        for design in ("matched_zero", "realised_interest"):
            result, path = run_account(P, product, rate, curve, pd.Timestamp("2000-01-01"),
                                       pd.Timestamp("2003-01-01"), design, catastrophe=True)
            self.assertGreaterEqual(result["saver_maturity"], 1)
            self.assertTrue(all(x["reserve"] >= -1e-12 for x in path))
            self.assertTrue(all(x["payout"] == x["locked"] for x in path))

    def test_zero_interest_has_zero_insurance_capacity_and_exposes_cost_deficit(self):
        dates = pd.date_range("2000-01-07", "2003-01-01", freq="W-FRI")
        product = dict(sold=np.ones(len(dates)), premium=np.ones(len(dates)) * .1,
                       claims=np.ones(len(dates)), missing_claim_weight=np.zeros(len(dates)), c=.1)
        rate = pd.Series(0., index=pd.date_range("1999-01-01", "2003-01-01"))
        result, _ = run_account(dict(dates=dates), product, rate, None, pd.Timestamp("2000-01-01"),
                                pd.Timestamp("2003-01-01"), "realised_interest")
        self.assertEqual(result["saver_maturity"], 1)
        self.assertEqual(result["notional_per_week"], 0)
        self.assertGreater(result["external_cost_funding_required"], .007)

    def test_matched_floor_rejects_when_operating_budget_is_not_funded(self):
        dates = pd.date_range("2000-01-07", "2003-01-01", freq="W-FRI")
        product = dict(sold=np.ones(len(dates)), premium=np.zeros(len(dates)),
                       claims=np.zeros(len(dates)), missing_claim_weight=np.zeros(len(dates)), c=.1)
        rate = pd.Series(0., index=pd.date_range("1999-01-01", "2003-01-01"))
        curve = pd.DataFrame({f"SVENY{i:02d}": [.1] for i in range(1, 31)}, index=[pd.Timestamp("1999-12-01")])
        result, path = run_account(dict(dates=dates), product, rate, curve, pd.Timestamp("2000-01-01"),
                                   pd.Timestamp("2003-01-01"), "matched_zero")
        self.assertFalse(result["accepted"])
        self.assertEqual(path, [])

    def test_holding_period_quote_waits_for_entire_historical_outcome(self):
        dates = pd.date_range("2000-01-07", periods=180, freq="W-FRI")
        rng = np.random.default_rng(7)
        P = dict(dates=dates, market=np.array(["US"] * 60),
                 g=rng.normal(0, .2, (180, 60)), sd=np.full((180, 60), .02),
                 eligible=np.ones((180, 60), bool), known=np.ones((180, 60), bool))
        original = pricing(P, .1, .9, information_lag=158, sessions=756, max_fee=.1)
        changed = dict(P, g=P["g"].copy())
        changed["g"][10:] = -.99
        altered = pricing(changed, .1, .9, information_lag=158, sessions=756, max_fee=.1)
        np.testing.assert_allclose(original["fee"][:168], altered["fee"][:168], equal_nan=True)

    def test_holiday_nan_curve_uses_last_available_valid_quote(self):
        dates = pd.date_range("2000-01-07", "2003-01-01", freq="W-FRI")
        product = dict(sold=np.zeros(len(dates)), premium=np.zeros(len(dates)),
                       claims=np.zeros(len(dates)), missing_claim_weight=np.zeros(len(dates)), c=.1)
        rate = pd.Series(.04, index=pd.date_range("1999-01-01", "2003-01-01"))
        curve = pd.DataFrame({f"SVENY{i:02d}": [4., np.nan] for i in range(1, 31)},
                             index=pd.to_datetime(["1999-12-01", "1999-12-20"]))
        result, _ = run_account(dict(dates=dates), product, rate, curve, pd.Timestamp("2000-01-01"),
                                pd.Timestamp("2003-01-01"), "matched_zero")
        self.assertTrue(result["accepted"])
        self.assertEqual(result["floor_quote_date"], "1999-12-01")
        self.assertAlmostEqual(result["external_cost_funding_required"], 0)


if __name__ == "__main__":
    unittest.main()
