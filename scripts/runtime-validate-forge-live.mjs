import { readFileSync } from 'node:fs';
import { loadPreferredPostgresEnv } from './lib/load-postgres-env.mjs';

loadPreferredPostgresEnv();

const BASE = (process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : process.env.GRUMPROLLED_BASE_URL || 'http://localhost:4692').replace(/\/$/, '');
const ADMIN_KEY = process.env.ADMIN_API_KEY || '';
const EXPECT_DOCKER = process.argv.includes('--expect-docker') || process.env.FORGE_EXPECT_DOCKER === 'true';
const EXPECT_VALIDATION_GATE = process.argv.includes('--expect-validation-gate') || process.env.FORGE_EXPECT_VALIDATION_GATE === 'true';
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail = '') {
	if (condition) {
		console.log(`  ${PASS} ${label}`);
		passed += 1;
		return;
	}
	console.log(`  ${FAIL} ${label}${detail ? `: ${detail}` : ''}`);
	failed += 1;
	failures.push({ label, detail });
}

function finish() {
	console.log('\n' + '─'.repeat(64));
	console.log(`Runtime Forge live-agent validation: ${passed} passed, ${failed} failed`);
	if (failures.length > 0) {
		console.log('\nFailures:');
		for (const failure of failures) {
			console.log(`  ${FAIL} ${failure.label}${failure.detail ? ` — ${failure.detail}` : ''}`);
		}
	}
	console.log('─'.repeat(64));
	process.exitCode = failed > 0 ? 1 : 0;
}

async function api(method, path, { token, adminKey, body } = {}) {
	const response = await fetch(`${BASE}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...(adminKey ? { 'x-admin-key': adminKey } : {}),
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	});

	let json = null;
	let text = '';
	try {
		text = await response.text();
		json = text ? JSON.parse(text) : null;
	} catch {
		json = text;
	}

	return { status: response.status, json };
}

function loadSquad() {
	return JSON.parse(readFileSync('scripts/squad-manifest.json', 'utf8'));
}

function requireAgent(manifest, username) {
	const agent = manifest.find((item) => item.username === username && item.apiKey);
	if (!agent) throw new Error(`${username} missing from scripts/squad-manifest.json or has no apiKey`);
	return agent;
}

async function main() {
	console.log(`\n🧪  Runtime Forge Live-Agent Validation (${BASE})\n`);
	console.log('No mock acceptance: this script uses the running site, real squad API keys, and real Forge APIs.');
	if (EXPECT_VALIDATION_GATE) {
		console.log('Validation gate mode: submitted artifact intentionally fails and review promotion must return HTTP 422.');
	}
	console.log('');

	assert('ADMIN_API_KEY configured', Boolean(ADMIN_KEY), 'set ADMIN_API_KEY in local env for owner-controlled Forge transitions');
	if (!ADMIN_KEY) {
		finish();
		return;
	}

	const manifest = loadSquad();
	const specialist = requireAgent(manifest, 'grump-forgemaster');
	const voters = ['grump-architect', 'grump-reviewer', 'grump-safety', 'grump-debugger', 'grump-dba', 'grump-philosopher']
		.map((username) => requireAgent(manifest, username));
	let proposalAuthor = specialist;

	assert('Forge specialist present in squad manifest', Boolean(specialist.apiKey));
	assert('six live squad voters available', voters.length === 6);

	const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	let slug = '';
	let proposalTitle = '';
	let reusedContributionProposal = false;
	const proposal = await api('POST', '/api/v1/forge/proposals', {
		token: specialist.apiKey,
		body: {
			title: `Forge live-agent proof lane ${nonce}`,
			goal: 'Prove the Forge lane can be driven by the existing resident squad using real API keys and owner-governed transitions.',
			constraints: 'No mocks, no direct database mutation, no bypassing owner approval; use the live proposal, election, ratification, and planning APIs.',
			success_test: 'A specialist-authored proposal reaches CONTRIBUTION with a frozen build brief and public Forge pages render it.',
			time_box_days: 7,
			category: 'CODING',
			required_roles: ['CONTRIBUTOR', 'REVIEWER'],
		},
	});

	if (proposal.status === 429) {
		let delegatedProposal = null;
		for (const candidate of voters) {
			const response = await api('POST', '/api/v1/forge/proposals', {
				token: candidate.apiKey,
				body: {
					title: `Forge live-agent proof lane ${nonce}`,
					goal: 'Prove the Forge lane can produce materialized build artifacts with the resident squad when the Forge specialist is rate-limited.',
					constraints: 'No mocks, no direct database mutation, no bypassing owner approval; use live squad agents and live Forge APIs only.',
					success_test: 'A squad-authored proposal reaches PUBLISH with retrievable server-side artifact files.',
					time_box_days: 7,
					category: 'CODING',
					required_roles: ['CONTRIBUTOR', 'REVIEWER'],
				},
			});
			if (response.status === 201) {
				proposalAuthor = candidate;
				delegatedProposal = response;
				break;
			}
		}
		assert('Forge specialist rate limit honored; squad delegate creates proposal → 201', delegatedProposal?.status === 201, JSON.stringify(delegatedProposal?.json));
		slug = delegatedProposal?.json?.slug;
		proposalTitle = delegatedProposal?.json?.title;
	} else {
		assert('Forge specialist creates proposal → 201', proposal.status === 201, `got ${proposal.status}: ${JSON.stringify(proposal.json)}`);
		slug = proposal.json?.slug;
		proposalTitle = proposal.json?.title;
	}

	assert('proposal slug returned', Boolean(slug), JSON.stringify(proposal.json));
	if (!slug) {
		finish();
		return;
	}

	if (!reusedContributionProposal) {
		const open = await api('POST', `/api/v1/forge/proposals/${slug}/open-election`, {
			adminKey: ADMIN_KEY,
			body: { duration_hours: 1 },
		});
		assert('owner opens Forge election → 200', open.status === 200, `got ${open.status}: ${JSON.stringify(open.json)}`);
		assert('proposal enters ELECTION', open.json?.status === 'ELECTION', JSON.stringify(open.json));

		const ballotVoters = voters.filter((voter) => voter.username !== proposalAuthor.username).slice(0, 5);
		assert('five non-author live voters available for quorum', ballotVoters.length === 5);
		for (const voter of ballotVoters) {
			const vote = await api('POST', `/api/v1/forge/proposals/${slug}/vote`, {
				token: voter.apiKey,
				body: { vote: 'up' },
			});
			assert(`${voter.username} casts live upvote → 200`, vote.status === 200, `got ${vote.status}: ${JSON.stringify(vote.json)}`);
		}

		const close = await api('POST', `/api/v1/forge/proposals/${slug}/close-election`, {
			adminKey: ADMIN_KEY,
			body: {},
		});
		assert('owner closes Forge election → 200', close.status === 200, `got ${close.status}: ${JSON.stringify(close.json)}`);
		assert('election approved into RATIFICATION', close.json?.status === 'RATIFICATION', JSON.stringify(close.json));
		assert('quorum met by live agents', close.json?.election_result?.quorumMet === true, JSON.stringify(close.json?.election_result));

		const ratify = await api('POST', `/api/v1/forge/proposals/${slug}/ratify`, {
			adminKey: ADMIN_KEY,
			body: { decision: 'approve', note: `Runtime Forge specialist proof approved at ${new Date().toISOString()}` },
		});
		assert('owner ratifies proposal → 200', ratify.status === 200, `got ${ratify.status}: ${JSON.stringify(ratify.json)}`);
		assert('proposal enters PLANNING', ratify.json?.status === 'PLANNING', JSON.stringify(ratify.json));

		const freeze = await api('POST', `/api/v1/forge/proposals/${slug}/freeze-brief`, {
			token: proposalAuthor.apiKey,
			body: {
				build_brief: 'Runtime Forge specialist proof brief. This brief is intentionally concrete: verify owner-governed Forge transitions, separate specialist/squad/public responsibilities, and expose contribution slices for later live agent execution.',
				slices: [
					{
						title: 'Runtime proof documentation',
						description: 'Write concise operator-facing notes explaining what the live Forge proof validated and what governance boundaries remain.',
						role: 'CONTRIBUTOR',
					},
					{
						title: 'Review lane checklist',
						description: 'Review the proof artifact for no-mock acceptance, owner approval, audit visibility, and public renderability.',
						role: 'REVIEWER',
					},
				],
			},
		});
		assert('Forge specialist freezes build brief → 200', freeze.status === 200, `got ${freeze.status}: ${JSON.stringify(freeze.json)}`);
		assert('proposal enters CONTRIBUTION', freeze.json?.status === 'CONTRIBUTION', JSON.stringify(freeze.json));
		assert('two contribution slices exposed', Array.isArray(freeze.json?.slices) && freeze.json.slices.length === 2, JSON.stringify(freeze.json));
	}

	const contributor = voters[1];
	const gate = await api('GET', `/api/v1/forge/proposals/${slug}/check-gate?slice_indices=0`, {
		token: contributor.apiKey,
	});
	assert('live contributor can query Forge trust gate → 200', gate.status === 200, `got ${gate.status}: ${JSON.stringify(gate.json)}`);
	assert('live contributor passes trust gate', gate.json?.results?.[0]?.eligible === true, JSON.stringify(gate.json));

	const claim = await api('POST', `/api/v1/forge/proposals/${slug}/contribute`, {
		token: contributor.apiKey,
		body: { slice_index: 0, role: 'CONTRIBUTOR', submission_notes: 'Claiming runtime proof artifact slice.' },
	});
	assert('live contributor claims Forge slice → 201', claim.status === 201, `got ${claim.status}: ${JSON.stringify(claim.json)}`);
	const contributionId = claim.json?.id;
	assert('claim returns contribution id', Boolean(contributionId), JSON.stringify(claim.json));

	const artifactContent = `export const forgeRuntimeProof = ${JSON.stringify({ slug, contributor: contributor.username, generated_at: new Date().toISOString() }, null, 2)};\n`;
	const validationScript = EXPECT_VALIDATION_GATE
		? `console.error('forge artifact validation intentionally failed for promotion gate proof');\nprocess.exit(42);\n`
		: `import { readFileSync } from 'node:fs';\nconst source = readFileSync('src/forge-runtime-proof.ts', 'utf8');\nif (!source.includes('forgeRuntimeProof')) {\n  throw new Error('Forge runtime proof export missing');\n}\nconsole.log('forge artifact validation passed');\n`;
	const submit = await api('PATCH', `/api/v1/forge/contributions/${contributionId}/submit`, {
		token: contributor.apiKey,
		body: {
			submission_notes: 'Submitting a real TypeScript artifact file for the Forge runtime proof.',
			artifacts: [
				{ path: 'package.json', content: JSON.stringify({ name: `forge-proof-${slug}`.slice(0, 90), private: true, type: 'module', scripts: { build: 'node validate.mjs', test: 'node validate.mjs' } }, null, 2) },
				{ path: 'validate.mjs', content: validationScript },
				{ path: 'src/forge-runtime-proof.ts', content: artifactContent },
				{ path: 'README.md', content: `# Forge runtime proof\n\nGenerated by ${contributor.username} for ${slug}.\n` },
			],
		},
	});
	assert('live contributor submits artifact files → 200', submit.status === 200, `got ${submit.status}: ${JSON.stringify(submit.json)}`);
	assert('submission materialized artifact files', submit.json?.artifacts?.some((file) => file.path.includes('src/forge-runtime-proof.ts')), JSON.stringify(submit.json?.artifacts));

	const accept = await api('PATCH', `/api/v1/forge/contributions/${contributionId}`, {
		adminKey: ADMIN_KEY,
		body: { status: 'ACCEPTED', rep_earned: 20, review_notes: 'Accepted during live Forge artifact proof.' },
	});
	assert('owner accepts artifact contribution → 200', accept.status === 200, `got ${accept.status}: ${JSON.stringify(accept.json)}`);
	assert('accepted artifact appears in assembled manifest', accept.json?.artifact_manifest?.files?.some((file) => file.path.includes('assembled/src/forge-runtime-proof.ts')), JSON.stringify(accept.json?.artifact_manifest));

	const review = await api('POST', `/api/v1/forge/proposals/${slug}/review`, {
		adminKey: ADMIN_KEY,
		body: {},
	});
	if (EXPECT_VALIDATION_GATE) {
		assert('owner review promotion is blocked by validation gate → 422', review.status === 422, `got ${review.status}: ${JSON.stringify(review.json)}`);
		assert('blocked review response exposes validation status', review.json?.validation_status === 'FAIL', JSON.stringify(review.json));
		assert('blocked review response includes artifact manifest', review.json?.artifact_manifest?.files?.length > 0, JSON.stringify(review.json));
		assert('blocked review response includes command logs', review.json?.validation?.commands?.some((command) => command.exit_code === 42), JSON.stringify(review.json?.validation));
		if (EXPECT_DOCKER) {
			assert('blocked review validation used Docker executor', review.json?.validation?.isolation?.executor === 'docker', JSON.stringify(review.json?.validation?.isolation));
			assert('blocked review validation kept network policy', review.json?.validation?.isolation?.network_mode === 'none', JSON.stringify(review.json?.validation?.isolation));
		}

		const blockedDetail = await api('GET', `/api/v1/forge/proposals/${encodeURIComponent(slug)}`);
		assert('blocked Forge proposal detail API fetches proof proposal → 200', blockedDetail.status === 200, `got ${blockedDetail.status}: ${JSON.stringify(blockedDetail.json)}`);
		assert('blocked proposal remains in CONTRIBUTION', blockedDetail.json?.status === 'CONTRIBUTION', JSON.stringify(blockedDetail.json));
		finish();
		return;
	}
	assert('owner advances assembled Forge build to REVIEW → 200', review.status === 200, `got ${review.status}: ${JSON.stringify(review.json)}`);
	assert('review response includes artifact manifest', review.json?.artifact_manifest?.files?.length > 0, JSON.stringify(review.json));
	assert('review runs isolated build validation', review.json?.artifact_manifest?.validation?.status === 'PASS', JSON.stringify(review.json?.artifact_manifest?.validation));
	if (EXPECT_DOCKER) {
		assert('review validation used Docker executor', review.json?.artifact_manifest?.validation?.isolation?.executor === 'docker', JSON.stringify(review.json?.artifact_manifest?.validation?.isolation));
		assert('review validation recorded sandbox limits', Boolean(review.json?.artifact_manifest?.validation?.isolation?.memory_limit && review.json?.artifact_manifest?.validation?.isolation?.cpu_limit), JSON.stringify(review.json?.artifact_manifest?.validation?.isolation));
	}

	const publish = await api('POST', `/api/v1/forge/proposals/${slug}/publish`, {
		adminKey: ADMIN_KEY,
		body: {},
	});
	assert('owner publishes assembled Forge artifact → 200', publish.status === 200, `got ${publish.status}: ${JSON.stringify(publish.json)}`);
	assert('publish exposes artifact URL', typeof publish.json?.gallery_artifact_url === 'string' && publish.json.gallery_artifact_url.includes('/artifacts'), JSON.stringify(publish.json));
	assert('publish includes validation command logs', publish.json?.artifact_manifest?.validation?.commands?.some((command) => command.stdout?.includes('forge artifact validation passed')), JSON.stringify(publish.json?.artifact_manifest?.validation));
	if (EXPECT_DOCKER) {
		assert('publish validation used Docker executor', publish.json?.artifact_manifest?.validation?.isolation?.executor === 'docker', JSON.stringify(publish.json?.artifact_manifest?.validation?.isolation));
		assert('publish validation kept network policy', publish.json?.artifact_manifest?.validation?.isolation?.network_mode === 'none', JSON.stringify(publish.json?.artifact_manifest?.validation?.isolation));
	}

	const artifacts = await api('GET', `/api/v1/forge/proposals/${slug}/artifacts?include_content=true`);
	assert('public artifact manifest endpoint returns → 200', artifacts.status === 200, `got ${artifacts.status}: ${JSON.stringify(artifacts.json)}`);
	assert('artifact endpoint returns real file content', artifacts.json?.manifest?.files?.some((file) => file.path.includes('assembled/src/forge-runtime-proof.ts') && file.content?.includes('forgeRuntimeProof')), JSON.stringify(artifacts.json?.manifest?.files));
	assert('artifact endpoint returns validation logs', artifacts.json?.manifest?.validation?.commands?.length >= 1, JSON.stringify(artifacts.json?.manifest?.validation));
	if (EXPECT_DOCKER) {
		assert('artifact endpoint returns Docker isolation metadata', artifacts.json?.manifest?.validation?.isolation?.executor === 'docker', JSON.stringify(artifacts.json?.manifest?.validation?.isolation));
	}

	const detail = await api('GET', `/api/v1/forge/proposals/${encodeURIComponent(slug)}`);
	assert('public Forge proposal detail API fetches proof proposal → 200', detail.status === 200, `got ${detail.status}: ${JSON.stringify(detail.json)}`);
	assert('public Forge detail API returns proof slug', detail.json?.slug === slug, JSON.stringify(detail.json));

	const list = await api('GET', '/api/v1/forge/proposals?status=PUBLISH&limit=50');
	assert('public Forge proposals API lists published proposals → 200', list.status === 200, `got ${list.status}: ${JSON.stringify(list.json)}`);
	assert('public Forge published list includes proof slug', list.json?.data?.some((item) => item.slug === slug), JSON.stringify(list.json?.data));

	const forgePage = await fetch(`${BASE}/forge`);
	const forgeHtml = await forgePage.text();
	assert('/forge page renders → 200', forgePage.status === 200, `got ${forgePage.status}`);
	assert('/forge page includes role-lane framing', forgeHtml.includes('Agent workbench') && forgeHtml.includes('Owner control plane') && forgeHtml.includes('Public build record'));

	const detailPage = await fetch(`${BASE}/forge/${encodeURIComponent(slug)}`);
	const detailHtml = await detailPage.text();
	assert('/forge/[slug] page renders proof proposal → 200', detailPage.status === 200, `got ${detailPage.status}`);
	assert('/forge/[slug] includes proof title', detailHtml.includes(proposalTitle), 'proof proposal title not found in detail HTML');

	finish();
}

main().catch((error) => {
	console.error(`\n${FAIL} runtime Forge live-agent validation crashed: ${error.message}`);
	failures.push({ label: 'runtime Forge live-agent validation crashed', detail: error.message });
	failed += 1;
	finish();
});
