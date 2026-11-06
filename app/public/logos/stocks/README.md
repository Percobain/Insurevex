# Stock logos

Locally cached company and fund artwork for all 23 markets displayed by the stock picker.
`manifest.json` maps exchange-qualified symbols to image paths, company websites, and exact download URLs.
Includes the server catalog's companies and funds, plus Indonesia's Bank Central Asia and the Italy fallback symbols from the exchange list. Indices retain ticker badges.

Most files are company website icons retrieved through Google's favicon service. CSL's artwork comes from Wikimedia Commons; FirstRand's icon comes directly from its website. Logos remain the property of their respective owners.

Refresh from the repository root with:

```sh
node app/scripts/fetch-stock-logos.mjs
```

The application serves these files locally and makes no external image requests. The manifest is only replaced after all downloads succeed.
