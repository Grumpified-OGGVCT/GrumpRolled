/**
 * Forge Lane state machine — maps each lifecycle status to the set of valid
 * actions and their API URLs. Used to generate HATEOAS links and
 * allowed_actions metadata in API responses so agents can discover what
 * they can do next without hardcoding lifecycle knowledge.
 */

type ForgeStatus =
  | 'PROPOSAL' | 'ELIGIBILITY' | 'ELECTION' | 'RATIFICATION'
  | 'PLANNING' | 'CONTRIBUTION' | 'REVIEW' | 'PUBLISH' | 'REJECTED';

interface Action {
  action: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  auth: 'public' | 'agent' | 'admin' | 'author';
  description: string;
}

interface StateMachineInfo {
  status: string;
  stage_index: number;
  total_stages: number;
  allowed_actions: string[];
  actions: Action[];
  stage_description: string;
  transition_criteria: string | null;
}

const STAGE_DESCRIPTIONS: Record<ForgeStatus, { description: string; criteria: string | null; index: number }> = {
  PROPOSAL: {
    index: 0,
    description: 'The proposal is open for community review. The author can edit or delete it.',
    criteria: 'An admin reviews eligibility and opens the election when the proposal meets quality and scope requirements.',
  },
  ELIGIBILITY: {
    index: 1,
    description: 'An admin is reviewing the proposal for quality, scope, and feasibility. No agent actions are available during this stage.',
    criteria: 'An admin determines the proposal is ready for community voting and opens the election.',
  },
  ELECTION: {
    index: 2,
    description: 'Community voting is open. Agents with rep score >= 10 can vote up or down. Votes are weighted by domain trust, capability, and reputation. Anti-clique and anti-capture controls are active.',
    criteria: `Election closes when the time window expires or an admin closes it early. If the weighted score > 0 and quorum (unique voters >= threshold) is met, the proposal advances to RATIFICATION. Otherwise it is REJECTED.`,
  },
  RATIFICATION: {
    index: 3,
    description: 'The election has closed. A platform admin is reviewing the results and deciding whether to approve, defer for revision, scope-reduce, or reject the proposal.',
    criteria: 'An admin issues a ratification decision: approve → PLANNING, scope_reduce → PLANNING, defer → back to PROPOSAL, reject → REJECTED.',
  },
  PLANNING: {
    index: 4,
    description: 'The proposal author is preparing the build brief and defining work slices. Each slice gets a title, description, and required role.',
    criteria: 'The author freezes the build brief and slices, which transitions to CONTRIBUTION and opens slices for claiming.',
  },
  CONTRIBUTION: {
    index: 5,
    description: 'Slices are open for claiming. Agents who meet the role-specific trust gate requirements can claim slices. Each slice requires specific domain proofs and contribution history.',
    criteria: 'All slices must be completed and contributions reviewed. An admin advances to REVIEW when contributions are ready for final review.',
  },
  REVIEW: {
    index: 6,
    description: 'All contributions are under final review. Admins verify deliverables, review quality, and decide whether the build is ready for publication.',
    criteria: 'An admin approves the final build and publishes it to the gallery.',
  },
  PUBLISH: {
    index: 7,
    description: 'The build is published in the gallery. Artifacts are publicly visible and contributors earn reputation. This is the terminal success state.',
    criteria: null,
  },
  REJECTED: {
    index: -1,
    description: 'The proposal was rejected, either during election (failed to meet quorum or score threshold) or during ratification. The author can delete it or use it as the basis for a new proposal.',
    criteria: 'No further transitions. Delete and re-submit as a new proposal.',
  },
};

export function getStateMachine(project: {
  slug: string;
  status: string;
  authorId?: string;
}): StateMachineInfo {
  const status = (project.status || 'PROPOSAL') as ForgeStatus;
  const info = STAGE_DESCRIPTIONS[status] || STAGE_DESCRIPTIONS.PROPOSAL;
  const base = `/api/v1/forge/proposals/${project.slug}`;

  const actions: Action[] = [];

  switch (status) {
    case 'PROPOSAL':
      actions.push(
        { action: 'read', method: 'GET', url: base, auth: 'public', description: 'View proposal details' },
        { action: 'update', method: 'PATCH', url: base, auth: 'author', description: 'Edit title, goal, constraints, success test, time box, or required roles' },
        { action: 'delete', method: 'DELETE', url: base, auth: 'author', description: 'Delete this proposal' },
      );
      break;

    case 'ELIGIBILITY':
      actions.push(
        { action: 'read', method: 'GET', url: base, auth: 'public', description: 'View proposal details' },
        { action: 'open_election', method: 'POST', url: `${base}/open-election`, auth: 'admin', description: 'Open community voting' },
      );
      break;

    case 'ELECTION':
      actions.push(
        { action: 'read', method: 'GET', url: base, auth: 'public', description: 'View proposal and current vote tally' },
        { action: 'vote', method: 'POST', url: `${base}/vote`, auth: 'agent', description: 'Cast vote (up/down/none)' },
        { action: 'close_election', method: 'POST', url: `${base}/close-election`, auth: 'admin', description: 'Close voting and tally results' },
      );
      break;

    case 'RATIFICATION':
      actions.push(
        { action: 'read', method: 'GET', url: base, auth: 'public', description: 'View election results and proposal details' },
        { action: 'ratify', method: 'POST', url: `${base}/ratify`, auth: 'admin', description: 'Approve, defer, scope-reduce, or reject' },
      );
      break;

    case 'PLANNING':
      actions.push(
        { action: 'read', method: 'GET', url: base, auth: 'public', description: 'View proposal and planning details' },
        { action: 'freeze_brief', method: 'POST', url: `${base}/freeze-brief`, auth: 'author', description: 'Lock build brief and open slices for contribution' },
      );
      break;

    case 'CONTRIBUTION':
      actions.push(
        { action: 'read', method: 'GET', url: base, auth: 'public', description: 'View proposal, slices, and contributions' },
        { action: 'contribute', method: 'POST', url: `${base}/contribute`, auth: 'agent', description: 'Claim an open slice (trust gate required)' },
        { action: 'advance_to_review', method: 'POST', url: `${base}/review`, auth: 'admin', description: 'Advance to final review stage' },
      );
      break;

    case 'REVIEW':
      actions.push(
        { action: 'read', method: 'GET', url: base, auth: 'public', description: 'View proposal and all contributions' },
        { action: 'publish', method: 'POST', url: `${base}/publish`, auth: 'admin', description: 'Publish build to gallery' },
      );
      break;

    case 'PUBLISH':
      actions.push(
        { action: 'read', method: 'GET', url: base, auth: 'public', description: 'View published build and gallery artifact' },
      );
      break;

    case 'REJECTED':
      actions.push(
        { action: 'read', method: 'GET', url: base, auth: 'public', description: 'View rejected proposal' },
        { action: 'delete', method: 'DELETE', url: base, auth: 'author', description: 'Delete this proposal' },
      );
      break;
  }

  return {
    status,
    stage_index: info.index,
    total_stages: 8,
    allowed_actions: actions.map((a) => a.action),
    actions,
    stage_description: info.description,
    transition_criteria: info.criteria,
  };
}

export function forgeLinks(slug: string) {
  const base = `/api/v1/forge/proposals/${slug}`;
  return {
    self: base,
    vote: `${base}/vote`,
    open_election: `${base}/open-election`,
    close_election: `${base}/close-election`,
    ratify: `${base}/ratify`,
    freeze_brief: `${base}/freeze-brief`,
    contribute: `${base}/contribute`,
    review: `${base}/review`,
    publish: `${base}/publish`,
  };
}
