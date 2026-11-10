export function AlignmentPreview() {
  return <div className="product-proof proof-alignment">
    <div className="proof-caption"><span>Stakeholder alignment</span><span>Current scope</span></div>
    <p className="proof-objective">Reduce repeated invoice checks without delegating payment authority.</p>
    <dl className="proof-positions">
      {[["Operations", "Supports with conditions"], ["Technology", "No current position"], ["Risk & compliance", "More evidence needed"]].map(([role, position]) =>
        <div key={role}><dt>{role}</dt><dd>{position}</dd></div>)}
    </dl>
    <div className="proof-action"><span>ACCOUNTABLE OWNER</span><strong>Operational owner</strong><small>Acceptance pending</small></div>
    <div className="proof-open"><strong>Decision needed</strong><p>Who authorizes exception decisions?</p><small>Unresolved · Next: confirm decision responsibility</small></div>
    <p className="proof-note">Nomination is not acceptance. No consensus is assumed.</p>
  </div>;
}

export function DecisionPreview() {
  return <div className="product-proof proof-decision">
    <div className="proof-caption"><span>Executive decision brief</span><span>Advisory</span></div>
    <div className="proof-verdict"><span>PROPOSED NEXT STEP</span><strong>Investigate further.</strong><p>Validate the evidence before committing to a pilot.</p></div>
    <dl className="proof-decision-facts">
      <div><dt>Intended outcome</dt><dd>Fewer repeat checks</dd></div>
      <div><dt>Why now</dt><dd>Duplicate work reported in S1 and S3</dd></div>
      <div><dt>What is missing</dt><dd>Baseline and integration access</dd></div>
      <div><dt>Human boundary</dt><dd>Finance retains payment approval</dd></div>
    </dl>
    <div className="proof-action"><span>NEXT ACTION</span><strong>Confirm the baseline and sandbox access.</strong><small>Owner and due date to agree</small></div>
    <p className="proof-note">Baseline unverified. No measured savings or pilot authorization.</p>
  </div>;
}

export function BlueprintPreview() {
  return <div className="product-proof proof-blueprint">
    <div className="proof-caption"><span>Visual architecture</span><span>Proposed</span></div>
    <ol className="proof-connected-flow" aria-label="Proposed invoice assistance architecture">
      <li data-kind="input"><span>01 / INPUT</span><strong>Invoice &amp; source records</strong><small>Access to validate</small></li>
      <li data-kind="rules"><span>02 / RULES</span><strong>Validate &amp; route</strong><small>State · bounded retries</small></li>
      <li data-kind="assist"><span>03 / AI ASSISTANCE</span><strong>Prepare an evidence summary</strong><small>Source-linked suggestions</small></li>
      <li data-kind="human"><span>04 / HUMAN DECISION</span><strong>Authorized finance review</strong><small>Accept · change · reject</small></li>
    </ol>
    <div className="proof-controls"><span>Scoped identity</span><span>Review logs</span><span>Escalation</span></div>
    <p className="proof-note">Conceptual customer design. Controls and integrations still need implementation and validation.</p>
  </div>;
}

export function WorkspacePreview() {
  return <div className="product-proof proof-workspace">
    <div className="proof-caption"><span>Home / Workspace filter</span><span>Illustrative</span></div>
    <div className="proof-scope"><div><span>Workspace organization</span><strong>Example bank <span aria-hidden="true">⌄</span></strong></div>
      <div><span>Workspace team</span><strong>Operations <span aria-hidden="true">⌄</span></strong></div></div>
    <p className="proof-scope-label">TEAM WORKSPACE / OPERATIONS</p>
    <ul className="proof-library"><li><span>Discovery engagement</span><strong>Invoice exception review</strong></li>
      <li><span>Workflow assessment</span><strong>Document-supported checks</strong></li></ul>
    <div className="proof-controls"><span>Membership-scoped</span><span>Permissions enforced</span></div>
    <p className="proof-note">Personal workspace remains separate. Switching scope does not move records.</p>
  </div>;
}
