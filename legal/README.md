# Legal Documents

This directory contains deployment-specific legal documents served at `/privacy`, `/terms`, and `/legal-notice`.

## Required files

| File | Route | Description |
|------|-------|-------------|
| `privacy.md` | `/privacy` | Privacy policy (Datenschutzerklärung) |
| `terms.md` | `/terms` | Terms of use (Nutzungsbedingungen) |
| `legal-notice.md` | `/legal-notice` | Legal notice (Impressum) |

## Setup

Create the markdown files in this directory. They are rendered as GitHub Flavored Markdown (headings, tables, bold, lists all work). For line breaks within a paragraph (e.g. addresses), use `<br>` at the end of the line.

These files are **gitignored** because they contain operator-specific information (name, address, hosting provider) that varies per deployment.

Set `LEGAL_ENABLED=true` in your `.env` to activate the legal pages.

## Note

If you host Mampfi publicly, you are responsible for providing legal documents as required by your jurisdiction. In Germany, an Impressum and Datenschutzerklärung are mandatory for any publicly accessible website.
