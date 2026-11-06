# InsureVEX: words and page rules

Who we write for: someone who has never bought insurance on a stock, does not know what a T-bill or a
"deductible" is, and will leave if a page makes them think. If a 15-year-old cannot understand a sentence on
first read, rewrite it.

## The three things you can do (this is the whole product)

| Nav label | Route | Who it is for | One-line promise |
|---|---|---|---|
| **Protect** | `/protect` | You own stocks | "Get paid if your stock crashes." |
| **Save** | `/save` | You want your money safe | "Your money back, guaranteed, plus extra." |
| **Earn** | `/pool` | You want higher returns and accept risk | "Back the protection and earn the fees." |

Plus **Proof** (`/metrics`): "What would have happened in every crash since 2001."
Secondary (in a "More" menu or footer, not the main nav): Research (`/docs`), Activity (`/activity`),
AI agent (`/agent`), Issuer (`/issuer`).

## Words: always use the left column, never the right

| Say this | Never say (to users) |
|---|---|
| protection, protect | cover, policy (OK once in small print), insurance product |
| price, fee ("you pay $12") | premium |
| starts paying after a drop of 10% | deductible, attachment, strike |
| pays up to 20% | cap, limit, exhaustion |
| how long | tenor, expiry (use "ends on 13 Nov") |
| savings plan | protected note, PPN, note, vx3Y, sleeve, floor |
| US government bonds (T-bills) the first time, then "government bonds" | T-bills alone, tokenised T-bill, NAV |
| the earning part | sleeve, vault units, senior tranche |
| the pool | vault, underwriting pool, ERC-4626 |
| earnings, paid out | coupon, yield distribution |
| end date | maturity |
| people protecting stocks / stock owners | holders, Holder |
| savers / people saving | Saver (capitalised role name), depositors on user pages |
| Pro (takes the first loss, earns more) | Pro LP, junior tranche, first-loss capital |
| ID check, verified | KYC, identity registry |
| paid automatically at the stock exchange's closing price | settled on the official close posted on-chain |
| test money (this is a test version) | testnet tokens, stablecoin (OK in small print) |
| your wallet | address, signer, EOA |

Numbers: always dollars first ("$1,500"), percentages second. One example beats three explanations.
Default example everywhere: **$10,000 of NVIDIA for 1 month costs about $90. If NVIDIA falls 25%, you get $1,500.**

## Page pattern (every user page)

1. **Hero**: headline of at most 8 words, one sentence of at most 20 words, one primary button that jumps to the
   action ("Get my price", "Start saving", "Start earning"). Optional small art on the right.
2. **The action, immediately.** Do not put a long explainer between the hero and the form.
3. **How it works**: at most 3 steps, each at most 12 words.
4. **Questions**: at most 5, collapsed, answers at most 2 short sentences.
5. Technical details (contract addresses, chain IDs, formulas, explorer links) go in a small "Details" block at
   the bottom of a section or behind a "More details" toggle. Never in the main flow.

## Rules

- At most one short paragraph visible per section. Cut words; never shrink the font to fit more.
- Buttons start with a verb and say what happens: "Get my price", "Protect 2 NVDA for $0.11", "Start saving $100".
- Every disabled button says why, right under it, in one short line.
- Errors say what to do next, not what went wrong internally.
- Empty states say what to do: "No protection yet. Protect a stock to see it here."
- Red only means losing money. Green means InsureVEX working for you.
- Sentence case for headings. No ALL CAPS paragraphs. No jargon in headings at all.
- Keep the existing visual style, components and colours (cards, Seg, chips, eyebrow labels). Change words,
  order and amount of text; do not restyle the design system.
- Never change contract calls, ABIs, data fetching or business logic while editing copy.
