import unittest

from economic_constraints import floor_budget, settle_candidate, funded_hedged_floor


class EconomicConstraintsTest(unittest.TestCase):
    def test_floor_failure_is_visible_instead_of_adding_face_by_assumption(self):
        out = floor_budget(1000, 1.12, 1)
        self.assertAlmostEqual(out["shortfall_if_risk_sleeve_wiped"], 107.142857142857)
        self.assertEqual(floor_budget(1000, 1.12, 1.12)["shortfall_if_risk_sleeve_wiped"], 0)

    def test_protecting_face_does_not_leave_a_free_risk_budget(self):
        self.assertEqual(floor_budget(1000, 1, 1)["risk_budget"], 0)
        self.assertFalse(floor_budget(1000, 1, 1, fees=1)["budget_feasible"])

    def test_net_profit_is_shared_after_claims(self):
        out = settle_candidate(1000, 500, 100, 80, .7)
        self.assertEqual(out["senior_profit"], 6)
        self.assertEqual(out["pro_profit"], 14)

    def test_losses_can_still_wipe_pro_and_reach_senior(self):
        out = settle_candidate(1000, 500, 100, 700, .7)
        self.assertEqual(out["pro_end"], 0)
        self.assertEqual(out["senior_profit"], -100)

    def test_scenario_grid_conserves_cash_and_never_creates_negative_accounts(self):
        for senior in (0, 100, 1000):
            for pro in (1, 100, 500):
                for premium in (0, 10, 100):
                    for cost in (0, 1):
                        cash = senior + pro + premium - cost
                        for fraction in (0, .25, .5, 1):
                            claims = cash * fraction
                            out = settle_candidate(senior, pro, premium, claims, .7, cost)
                            self.assertGreaterEqual(out["senior_end"], -1e-9)
                            self.assertGreaterEqual(out["pro_end"], -1e-9)
                            self.assertAlmostEqual(out["senior_end"] + out["pro_end"], cash - claims)
                            if premium >= claims + cost:
                                self.assertGreaterEqual(out["pro_profit"], -1e-9)

    def test_unfunded_obligations_are_rejected(self):
        with self.assertRaises(ValueError):
            settle_candidate(100, 50, 10, 161, .7)
        with self.assertRaises(ValueError):
            settle_candidate(100, 0, 10, 0, .7)

    def test_exact_put_hedge_matches_retail_floor_and_preserves_margin(self):
        quote = funded_hedged_floor(1000, .88, 10, 100, 20, .1, 2, 1, 3)
        self.assertEqual(quote["risk_cash"], 110)
        self.assertEqual(quote["maximum_claim"], 90)
        self.assertEqual(quote["minimum_retail_premium"], 14)
        for terminal in (0, 1, 10, 18, 19, 20, 100, 1000):
            retail_claim = 100 * max(-.1 - (terminal / 20 - 1), 0)
            hedge_receipt = quote["shares"] * max(quote["strike"] - terminal, 0)
            self.assertAlmostEqual(retail_claim, hedge_receipt)
            net = quote["minimum_retail_premium"] - quote["hedge_cost"] - 1 - retail_claim + hedge_receipt
            self.assertAlmostEqual(net, 3)

    def test_forecast_premiums_cannot_replace_existing_claim_backing(self):
        with self.assertRaises(ValueError):
            funded_hedged_floor(1000, .99, 10, 100, 20, .1, 2, 1, 3)


if __name__ == "__main__":
    unittest.main()
