export default function Content() { return <>
<header><small>KAISERSOL / SAMPLE WORKFLOW REVIEW</small>
<h1 id="landing-title" tabIndex={-1}>Should we fund an AI pilot for claims intake?</h1>
<p>For the claims operations lead and finance partner. Fictional example, not a client result.</p>
<p className="decision"><strong>Recommendation: fund measurement first, not software.</strong> One conflicting date tells us a check is needed. It tells us nothing about the size or cause of the backlog.</p></header>
<section><h2>What the file shows</h2><p>A physiotherapy claim form records a visit on 6 May; the itemised bill says 8 May. Neither source establishes which date is correct. A specialist checks both before asking the clinic. The examiner retains the coverage decision.</p></section>
<section><h2>What the operations lead should measure</h2><p>With the data owner’s permission, sample consecutive cases across bill formats and shifts, not just known mismatches. Record cases per week, hands-on checking time, time waiting for replies and corrections. Have a second reviewer check a subset for missed discrepancies.</p>
<p>Separate staff time from waiting time: faster reading will not fix a queue that is waiting on clinic replies.</p></section>
<section><h2>Three choices for the budget owner</h2><dl>
<dt>Change the form</dt><dd>If people enter the invoice date instead of the visit date, clarify the field and measure rework again.</dd>
<dt>Use a fixed rule</dt><dd>If both dates already arrive as structured fields, compare them directly. A mismatch goes to a person; no model is needed.</dd>
<dt>Test AI extraction</dt><dd>If finding dates on varied bills consumes most staff time, test extraction on authorised examples. Use the same comparison rule. Include unclear scans and abstentions in the results.</dd>
</dl></section>
<section><h2>When to release pilot funding</h2><p>The claims lead sets acceptable missed-discrepancy and unnecessary-referral rates before testing. Compare the candidate with the current method on the same held-out cases. Count review, correction and escalation time, not just model response time.</p>
<p><strong>Finance check:</strong> weekly cases × net minutes saved per case ÷ 60 = potential hours released per week. Compare their usable value with setup, running and supervision costs. Released capacity is not cash savings unless spending actually changes.</p>
<p><strong>Next decision:</strong> the operations lead and finance partner review the baseline together. Stop if a form change solves the problem. Scope a pilot only if the remaining burden is material and the data owner approves testing.</p></section>
<footer><a href="/#first-conversation">Discuss a workflow with Kaisersol</a> · <a href="/#claim-review">Compare manual and assisted intake</a></footer>
</>; }
