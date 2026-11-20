# Security policy

Vereino will hold children's personal data and club money, so we take security reports seriously and handle them privately.

## Reporting a vulnerability

**Do not open a public issue, discussion or pull request for a vulnerability.**

Report it through GitHub's private vulnerability reporting: open the repository's [**Security** tab](https://github.com/wladku/Vereino/security) and choose **Report a vulnerability** ([direct link](https://github.com/wladku/Vereino/security/advisories/new)). Only the maintainers see the report, and we can discuss it, fix it and publish an advisory there together with you.

Please include:

- the affected component (module, route, page or file) and the version or commit;
- the steps to reproduce, or a proof of concept;
- the impact as you understand it (for example, data of another club or another family becomes visible);
- whether you want to be credited, and under which name.

If the **Report a vulnerability** button is not available, open an issue titled "Security contact request" with no details of the problem, and a maintainer will give you a private channel.

## Supported versions

| Version | Supported |
|---|---|
| The latest release | ✅ |
| Older releases | ❌ |
| `main`, until the first release | ✅ |

Fixes are made on `main` and shipped in the next release; we do not back-port them to older releases.

## What happens next

- We acknowledge your report within **3 working days**.
- We confirm or reject the problem, keep you informed, and aim to fix or mitigate a confirmed vulnerability within **90 days** of the report — sooner for a critical one.
- We follow **coordinated disclosure**: please keep the details private until a fix is released or the 90 days have passed, whichever comes first. We agree the publication date with you and credit you in the advisory unless you prefer not to be named.
- Vereino has **no bug bounty**; we cannot pay for reports.

## Safe harbour

We will not pursue or support legal action against anyone who researches and reports a vulnerability in good faith under this policy: who avoids privacy violations, data destruction and service disruption; uses only their own test accounts and test data (never real club, member or payment data); does not exploit a problem beyond what is needed to show it; and gives us reasonable time to fix it before any disclosure.

## Out of scope

- Vulnerabilities in the Open Mercato platform itself (`@open-mercato/*` packages): report them to the [Open Mercato project](https://github.com/open-mercato/open-mercato). If one affects Vereino, tell us as well and we will track it.
- Findings that need a compromised device or account, social engineering, denial of service by volume, or automated scanner output without a demonstrated impact.
