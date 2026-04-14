# Legal Documents

This directory contains deployment-specific legal documents served at `/privacy`, `/terms`, and `/impressum`.

## Required files

| File | Route | Description |
|------|-------|-------------|
| `privacy.md` | `/privacy` | Privacy policy (Datenschutzerklärung) |
| `terms.md` | `/terms` | Terms of use (Nutzungsbedingungen) |
| `impressum.md` | `/impressum` | Legal notice (Impressum) |

## Setup

Create the markdown files in this directory. They are served as plain text by the API at `/v1/legal/{slug}`.

These files are **gitignored** because they contain operator-specific information (name, address, hosting provider) that varies per deployment.

## Note

If you host Mampfi publicly, you are responsible for providing legal documents as required by your jurisdiction. In Germany, an Impressum and Datenschutzerklärung are mandatory for any publicly accessible website.
