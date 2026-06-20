# Auto-Approval Policy Feedback From Automated Pen Testing Workflow

This note captures concrete agent-operator feedback from testing the Automated Pen Testing market workflow. It focuses on places where the auto-approval policy was unclear or where user-facing behavior should be improved.

## Source Discovery Decisions

### XBOW, Horizon3.ai, Pentera, Vonahi, Tenzai

- What I did: Treated official vendor websites as appropriate seed sources for crawling.
- Ambiguity: No major ambiguity for known official vendor sites. Tenzai was newer and had only a homepage-style official source, but it was still clearly vendor-owned and market-relevant.
- Desired AGENTS.md rule: Auto-accept official vendor websites as source surfaces when the vendor is plausibly in market scope and the URL is clearly vendor-owned. For new entrants, official homepage evidence is enough to crawl, but not necessarily enough to accept all extracted claims.

### Cobalt

- What I did: Included it as a source to crawl, but later left company/product candidates for review because it looked human-led AI-powered PTaaS rather than core autonomous pentesting.
- Ambiguity: It uses AI and automation language, but the core model is explicitly human-led. That made it unclear whether it belonged in the market or only as adjacent PTaaS.
- Desired AGENTS.md rule: Auto-accept official sources for adjacent companies when they are useful for boundary research, but mark downstream company/product extraction as boundary-review unless the evidence clearly says the product performs autonomous or automated pentesting itself.

### Picus Security

- What I did: Crawled Picus. Later accepted `Picus Attack Path Validation` as an in-scope product but left `Picus Security` as a company for review because the company is broader BAS/security validation.
- Ambiguity: Product-level evidence was in scope, company-level positioning was broader and adjacent.
- Desired AGENTS.md rule: Company and product fit can differ. If a broad platform company has one clearly in-scope product, auto-accept the product if evidence is clear, but leave the company classification for boundary review as core vs adjacent.

### AttackIQ

- What I did: Crawled AttackIQ and left the company candidate for review.
- Ambiguity: Evidence supported security control validation/adversary emulation, not core automated pentesting. It was useful for comparison but not clearly in scope.
- Desired AGENTS.md rule: Security validation/BAS/adversary emulation vendors should be adjacent by default unless evidence shows broader automated pentest or exploit-path validation beyond predefined control validation.

## Company/Product Extraction Decisions

### Core Companies Accepted

- Items: XBOW, Horizon3.ai, Pentera, Vonahi Security, Tenzai.
- What I did: Accepted as core or likely core companies after audit because official evidence directly positioned them around autonomous/automated/full pentesting.
- Ambiguity: Tenzai had only one official homepage source and is newer. It was still direct enough to accept as medium confidence.
- Desired AGENTS.md rule: One official source is enough for company/product identity and positioning when the page is current, vendor-owned, and directly states the market-relevant function. Use medium confidence for newer companies or thin evidence.

### Core Products Accepted

- Items: XBOW, NodeZero, Pentera Platform, vPenTest, Tenzai, Picus Attack Path Validation.
- What I did: Accepted these products because each had direct official evidence for automated/autonomous pentesting, exploitability validation, or attack path validation.
- Ambiguity: Picus APV was accepted even though Picus company was left for review. That distinction should be explicitly allowed.
- Desired AGENTS.md rule: Product-level candidates may be accepted independently from company-level candidates. Accept a product when the product page is direct and in scope, even if the broader company remains adjacent.

### Boundary Cases Left For Review

- Items: Cobalt, Cobalt AI-Powered Offensive Security, Picus Security, AttackIQ.
- What I did: Left them proposed/for review with uncertainty.
- Ambiguity: All had official evidence and some relevant language, but each had a boundary issue:
  - Cobalt: human-led PTaaS with AI automation.
  - Picus Security: broader BAS/security validation company.
  - AttackIQ: security control validation/adversary emulation.
- Desired AGENTS.md rule: When evidence is official but market fit is boundary-adjacent, present the decision as `core`, `adjacent`, `exclude`, or `needs more evidence`; do not silently accept as core.

## Problems, Capabilities, And Categories

### Autonomous Penetration Testing Category

- What I did: Accepted the category.
- Ambiguity: It was broad, but it matched the market definition and was supported by multiple vendors.
- Desired AGENTS.md rule: Market-level categories can be accepted when they summarize recurring positioning across at least two core vendors or directly mirror the approved market boundary.

### Exploitability Validation

- What I did: Accepted as a capability.
- Ambiguity: None significant. It appeared across Horizon3.ai and Pentera evidence and is central to the market.
- Desired AGENTS.md rule: Accept capabilities that recur across multiple vendors and describe what the products do, not just a vendor slogan.

### Attack Path Chaining

- What I did: Accepted after fixing a quote mismatch.
- Ambiguity: The capability is supported by several vendors but the exact phrasing varies: chaining vulnerabilities, attack paths, lateral movement, exploit paths.
- Desired AGENTS.md rule: For capabilities with variant terminology, use a neutral analyst label if the underlying evidence supports the behavior across vendors.

### Continuous Retesting And Remediation Validation

- What I did: Accepted as a capability.
- Ambiguity: The wording combines two related behaviors: recurring testing and validating fixes. That is acceptable for this market, but could become too broad in other markets.
- Desired AGENTS.md rule: Combined capabilities are acceptable when vendors present the behaviors as part of the same workflow. If they are separable buying criteria, split them.

### Problems

- Items: `Vulnerability scanners produce theoretical findings without exploitability proof`; `Manual pentesting does not scale to continuous coverage`.
- What I did: Accepted both as buyer problems.
- Ambiguity: These are analyst-synthesized problem statements, not direct vendor product names.
- Desired AGENTS.md rule: Analyst-synthesized problems are acceptable when supported by direct evidence from multiple vendors and phrased as buyer pain, not vendor marketing copy.

## Evidence Quality

### When One Official Source Felt Enough

- Items: XBOW, NodeZero, Pentera, vPenTest, Tenzai identity/product positioning.
- What I did: Accepted direct identity/product-positioning candidates even when audit only had one official source.
- Ambiguity: Audit flagged single-evidence as low severity, but policy did not clearly say whether one official source is enough.
- Desired AGENTS.md rule: A single official source is enough for basic company/product identity and direct positioning if the quote is specific and current. Do not require multiple sources for every obvious vendor-owned product claim.

### When One Official Source Felt Weak

- Items: Cobalt, AttackIQ, Picus Security company-level classification.
- What I did: Left for review when the one source was official but market fit was adjacent.
- Ambiguity: The weakness was not source trust; it was boundary fit.
- Desired AGENTS.md rule: Separate evidence trust from market fit. Official evidence can still produce a `needs review` decision when it supports an adjacent classification rather than core inclusion.

### Vendor-Only Evidence

- What I did: Accepted vendor-only evidence for positioning, but not for independent proof of superiority or market claims.
- Ambiguity: The workflow did not extract many claims, but report generation would become misleading if vendor-only claims were accepted as facts.
- Desired AGENTS.md rule: Vendor-owned evidence is enough for "Vendor says/positions/offers X." It is not enough for comparative claims like best, leader, most accurate, market share, or performance superiority unless framed as vendor-reported or corroborated.

### Staleness

- What I did: Did not encounter serious stale evidence in this run.
- Ambiguity: Some crawled materials were blogs/resources, but candidates used current official product/homepage pages where possible.
- Desired AGENTS.md rule: Prefer current product/homepage/docs pages over old blogs or launch posts for durable positioning. Use old posts for history only, unless no current page exists.

## User Interruption And Review Behavior

### What I Asked Or Did Not Ask

- What I did: I auto-accepted 17 candidates and left 4 boundary cases for later review.
- Ambiguity: I did not ask before accepting Tenzai despite thin evidence. This was probably acceptable because evidence was direct, but policy should make that explicit.
- Desired AGENTS.md rule: Ask the user for boundary/category judgment, not for obvious identity or product-positioning facts from official pages.

### Silent Acceptance Risk

- Item: Picus Attack Path Validation.
- What I did: Accepted the product while leaving the broader company for review.
- Ambiguity: This is a nuanced decision that could surprise a user if not explained.
- Desired AGENTS.md rule: When accepting an in-scope product from a broader adjacent company, summarize that distinction in user-facing output.

## Language Quality

### What Went Wrong

- What I did: I exposed internal language heavily: candidates, proposed, accepted, audit, run ids, document ids, source ids, extraction run, and candidate ids.
- Ambiguity: This was useful for CLI traceability but bad for product-strategy UX.
- Desired AGENTS.md rule: Default user-facing summaries should say:
  - companies researched.
  - products/solutions found.
  - problems identified.
  - capabilities identified.
  - boundary cases needing judgment.
  - evidence gaps.
- Internal terms and ids should move to a traceability appendix or be shown only when the user asks.

### Better Summary Shape

Use this style:

> I found 5 core companies, 6 products, 3 recurring capabilities, and 2 buyer problems. I also found 4 boundary cases: Cobalt, Cobalt AI-Powered Offensive Security, Picus Security, and AttackIQ. I recommend treating those as adjacent unless you want the market to include PTaaS and security validation platforms.

Avoid this style:

> Imported 21 candidates, accepted 17, left 4 proposed, audit found 15 low findings.

## Missing AGENTS.md Policy Examples

Add examples like these:

1. **Official core vendor**
   - Example: XBOW official product page says AI agents behave like pentesters with exploit validation.
   - Decision: auto-accept company/product as core if evidence quote matches and no medium/high audit findings.

2. **New entrant with one official homepage**
   - Example: Tenzai homepage says it runs full pentests end-to-end.
   - Decision: auto-accept as medium confidence if direct and current; note evidence is thin only if making stronger claims.

3. **Broad adjacent company with in-scope product**
   - Example: Picus Security is broader security validation/BAS, but Picus Attack Path Validation uses automated penetration testing for attack path validation.
   - Decision: accept product as in scope; leave company as boundary review or adjacent.

4. **Human-led PTaaS with AI automation**
   - Example: Cobalt combines intelligent automation with expert pentesters.
   - Decision: leave for review as adjacent unless the market boundary explicitly includes human-led PTaaS.

5. **Security validation/BAS vendor**
   - Example: AttackIQ validates controls and runs adversary emulation.
   - Decision: adjacent by default; accept only if evidence shows automated pentesting or exploit-path validation within the market boundary.

6. **Single official evidence**
   - Example: one official product page supports product identity.
   - Decision: enough for identity/positioning; not enough for independent performance or leadership claims.

7. **Analyst-synthesized problem**
   - Example: "Manual pentesting does not scale to continuous coverage."
   - Decision: acceptable if supported by multiple vendor evidence quotes and phrased as a buyer problem.

8. **User-facing language**
   - Example: "5 core companies, 4 boundary cases, 3 recurring capabilities."
   - Decision: use this by default; hide candidate/source/audit terminology unless requested.
