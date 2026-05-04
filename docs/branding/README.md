# Branding assets

| File | Purpose | Source |
|---|---|---|
| `axi-peaq-banner.svg` | Repo header banner. Inline-rendered SVG approximation. Ships by default. | Hand-authored to match the AXI x peaq partnership lockup |
| `axi-peaq-banner.png` | Same banner, rasterised. Drop the canonical PNG here and the README `<picture>` tag picks it up over the SVG. | Brian's design source |

To swap the banner for a brand-canonical PNG, save it as `axi-peaq-banner.png` in this folder and the README will start serving it on the next page load (browsers prefer PNG when both are listed in the `<picture>` source set).
