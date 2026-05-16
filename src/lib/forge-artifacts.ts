import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, normalize, relative, sep } from 'node:path';
import { spawn } from 'node:child_process';

import { db } from '@/lib/db';

export type SubmittedForgeArtifact = {
  path: string;
  content: string;
};

export type ForgeArtifactFile = {
  path: string;
  bytes: number;
  source?: {
    contribution_id: string;
    slice_index: number;
    agent_id: string;
  };
  content?: string;
};

export type ForgeArtifactManifest = {
  schema_version: 1;
  project: {
    id: string;
    slug: string;
    title: string;
    status: string;
    assembled_at: string;
  };
  workspace_root: string;
  files: ForgeArtifactFile[];
  validation?: ForgeBuildValidation;
};

export type ForgeBuildValidationCommand = {
  command: string;
  args: string[];
  cwd: string;
  exit_code: number | null;
  timed_out: boolean;
  stdout: string;
  stderr: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
};

export type ForgeBuildValidationExecutor = 'local' | 'docker';

export type ForgeBuildValidationIsolation = {
  executor: ForgeBuildValidationExecutor;
  image?: string;
  container_id?: string;
  network_mode: string;
  cpu_limit?: string;
  memory_limit?: string;
  pids_limit?: string;
  read_only_root: boolean;
  dependency_policy: 'none' | 'lockfile-only' | 'allowlist';
  fallback_used: boolean;
  cleanup_status?: 'removed' | 'not-applicable' | 'unknown';
};

export type ForgeBuildValidation = {
  status: 'PASS' | 'FAIL' | 'SKIPPED' | 'BLOCKED_BY_POLICY' | 'INFRASTRUCTURE_ERROR';
  reason?: string;
  validated_at: string;
  workspace: string;
  isolation: ForgeBuildValidationIsolation;
  commands: ForgeBuildValidationCommand[];
};

type ForgeValidationConfig = {
  mode: 'local' | 'docker' | 'auto';
  allowLocalFallback: boolean;
  image: string;
  networkMode: string;
  cpuLimit: string;
  memoryLimit: string;
  pidsLimit: string;
  timeoutMs: number;
  dependencyPolicy: 'none' | 'lockfile-only' | 'allowlist';
  dependencyAllowlist: string[];
};

const MAX_ARTIFACTS_PER_SUBMISSION = 12;
const MAX_ARTIFACT_BYTES = 200_000;
const MAX_LOG_CHARS = 20_000;

function validationConfig(): ForgeValidationConfig {
  const dependencyAllowlist = (process.env.FORGE_DEPENDENCY_ALLOWLIST || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    mode: (process.env.FORGE_VALIDATION_MODE as ForgeValidationConfig['mode']) || 'local',
    allowLocalFallback: process.env.FORGE_VALIDATION_ALLOW_LOCAL_FALLBACK === 'true' || process.env.NODE_ENV !== 'production',
    image: process.env.FORGE_VALIDATION_IMAGE || 'grumprolled-forge-validator:local',
    networkMode: process.env.FORGE_VALIDATION_NETWORK || 'none',
    cpuLimit: process.env.FORGE_VALIDATION_CPUS || '1',
    memoryLimit: process.env.FORGE_VALIDATION_MEMORY || '512m',
    pidsLimit: process.env.FORGE_VALIDATION_PIDS || '128',
    timeoutMs: Number(process.env.FORGE_BUILD_TIMEOUT_MS || 30_000),
    dependencyPolicy: (process.env.FORGE_DEPENDENCY_POLICY as ForgeValidationConfig['dependencyPolicy']) || 'none',
    dependencyAllowlist,
  };
}

export function forgeValidationRequiresPass(): boolean {
  return process.env.FORGE_VALIDATION_REQUIRE_PASS === 'true' || process.env.NODE_ENV === 'production';
}

export function forgeValidationBlocksPromotion(validation: ForgeBuildValidation): boolean {
  return forgeValidationRequiresPass() && validation.status !== 'PASS';
}

function localIsolation(fallbackUsed = false): ForgeBuildValidationIsolation {
  return {
    executor: 'local',
    network_mode: 'host-process',
    read_only_root: false,
    dependency_policy: validationConfig().dependencyPolicy,
    fallback_used: fallbackUsed,
    cleanup_status: 'not-applicable',
  };
}

function dockerIsolation(config = validationConfig()): ForgeBuildValidationIsolation {
  return {
    executor: 'docker',
    image: config.image,
    network_mode: config.networkMode,
    cpu_limit: config.cpuLimit,
    memory_limit: config.memoryLimit,
    pids_limit: config.pidsLimit,
    read_only_root: true,
    dependency_policy: config.dependencyPolicy,
    fallback_used: false,
    cleanup_status: 'removed',
  };
}

function artifactRoot() {
  return process.env.FORGE_ARTIFACT_ROOT || join(/* turbopackIgnore: true */ process.cwd(), 'storage', 'forge-artifacts');
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 160) || 'artifact';
}

export function sanitizeArtifactPath(input: string) {
  const cleaned = normalize(input.replace(/\\/g, '/')).replace(/^([/\\])+/, '');
  if (!cleaned || cleaned === '.' || cleaned.includes('..') || cleaned.split(/[\\/]/).some((part) => part === '..')) {
    throw new Error(`Unsafe artifact path: ${input}`);
  }
  return cleaned
    .split(/[\\/]/)
    .filter(Boolean)
    .map(safeSegment)
    .join('/');
}

function ensureInside(root: string, target: string) {
  const rel = relative(root, target);
  if (rel.startsWith('..') || rel.includes(`..${sep}`) || rel === '..') {
    throw new Error('Artifact path escapes workspace root');
  }
}

function parseArtifactsFromText(text: string | null | undefined): SubmittedForgeArtifact[] {
  if (!text?.trim()) return [];

  const fileHeader = text.match(/FILE:\s*(.+)/i)?.[1]?.trim();
  const content = text.match(/CONTENT:\s*([\s\S]+)/i)?.[1]?.trim();
  if (fileHeader && content) {
    return [{ path: fileHeader, content }];
  }

  return [{ path: 'submission.md', content: text.trim() }];
}

function normalizeSubmittedArtifacts(artifacts: unknown, fallbackText: string | null | undefined): SubmittedForgeArtifact[] {
  const fromPayload = Array.isArray(artifacts)
    ? artifacts.map((item) => ({
        path: String((item as Record<string, unknown>)?.path || '').trim(),
        content: String((item as Record<string, unknown>)?.content || ''),
      }))
    : [];
  const normalized = fromPayload.filter((item) => item.path && item.content.trim());
  const result = normalized.length > 0 ? normalized : parseArtifactsFromText(fallbackText);

  if (result.length > MAX_ARTIFACTS_PER_SUBMISSION) {
    throw new Error(`Too many artifacts; maximum is ${MAX_ARTIFACTS_PER_SUBMISSION}`);
  }

  for (const artifact of result) {
    artifact.path = sanitizeArtifactPath(artifact.path);
    const bytes = Buffer.byteLength(artifact.content, 'utf8');
    if (bytes > MAX_ARTIFACT_BYTES) {
      throw new Error(`Artifact ${artifact.path} exceeds ${MAX_ARTIFACT_BYTES} bytes`);
    }
  }

  return result;
}

async function listFiles(root: string, base = root): Promise<ForgeArtifactFile[]> {
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = await readdir(base, { withFileTypes: true }) as Array<{ name: string; isDirectory(): boolean }>;
  } catch {
    return [];
  }

  const files: ForgeArtifactFile[] = [];
  for (const entry of entries) {
    const fullPath = join(base, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, fullPath));
      continue;
    }
    const info = await stat(fullPath);
    files.push({ path: relative(root, fullPath).replace(/\\/g, '/'), bytes: info.size });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function pathExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function npmInvocation(args: string[]): [string, string[]] {
  if (process.env.npm_execpath) {
    return [process.execPath, [process.env.npm_execpath, ...args]];
  }
  return [npmCommand(), args];
}

function trimLog(value: string) {
  if (value.length <= MAX_LOG_CHARS) return value;
  return `${value.slice(0, MAX_LOG_CHARS)}\n[forge validation log truncated]`;
}

function runValidationCommand(command: string, args: string[], cwd: string, timeoutMs: number): Promise<ForgeBuildValidationCommand> {
  return new Promise((resolve) => {
    const startedAt = new Date();
    const safeEnv = Object.fromEntries(
      Object.entries({
        ...process.env,
        CI: 'true',
        npm_config_audit: 'false',
        npm_config_fund: 'false',
        npm_config_update_notifier: 'false',
      }).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    ) as NodeJS.ProcessEnv;

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let child: ReturnType<typeof spawn>;

    try {
      child = spawn(command, args, {
        cwd,
        shell: false,
        windowsHide: true,
        env: safeEnv,
      });
    } catch (error) {
      const finishedAt = new Date();
      resolve({
        command,
        args,
        cwd,
        exit_code: null,
        timed_out: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      stderr += `\n${error.message}`;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const finishedAt = new Date();
      resolve({
        command,
        args,
        cwd,
        exit_code: code,
        timed_out: timedOut,
        stdout: trimLog(stdout),
        stderr: trimLog(stderr),
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
      });
    });
  });
}

function dockerRunArgs(config: ForgeValidationConfig, workspace: string, command: string, args: string[]) {
  const containerName = `gr-forge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dockerArgs = [
    'run',
    '--rm',
    '--name', containerName,
    '--label', 'grumprolled.forge.validation=true',
    '--network', config.networkMode,
    '--cpus', config.cpuLimit,
    '--memory', config.memoryLimit,
    '--pids-limit', config.pidsLimit,
    '--read-only',
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m',
    '--workdir', '/workspace',
    '--env', 'CI=true',
    '--env', 'HOME=/tmp',
    '--env', 'npm_config_audit=false',
    '--env', 'npm_config_cache=/tmp/npm-cache',
    '--env', 'npm_config_fund=false',
    '--env', 'npm_config_update_notifier=false',
    '--volume', `${workspace.replace(/\\/g, '/')}:/workspace:rw`,
    config.image,
    command,
    ...args,
  ];

  return { containerName, dockerArgs };
}

async function runDockerValidationCommand(
  config: ForgeValidationConfig,
  workspace: string,
  command: string,
  args: string[],
): Promise<ForgeBuildValidationCommand> {
  const { dockerArgs } = dockerRunArgs(config, workspace, command, args);
  const result = await runValidationCommand('docker', dockerArgs, process.cwd(), config.timeoutMs + 5_000);
  return {
    ...result,
    command,
    args,
    cwd: '/workspace',
  };
}

async function dependencyPolicyViolation(
  packageJson: {
    dependencies?: Record<string, unknown>;
    devDependencies?: Record<string, unknown>;
    optionalDependencies?: Record<string, unknown>;
    peerDependencies?: Record<string, unknown>;
  },
  config: ForgeValidationConfig,
  assembledRoot: string,
) {
  const dependencyNames = [
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
    ...Object.keys(packageJson.optionalDependencies || {}),
    ...Object.keys(packageJson.peerDependencies || {}),
  ];
  if (dependencyNames.length === 0) return null;

  if (config.dependencyPolicy === 'none') {
    return `Dependency policy 'none' blocks package dependencies: ${dependencyNames.slice(0, 20).join(', ')}`;
  }

  if (config.dependencyPolicy === 'lockfile-only') {
    const lockfiles = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'];
    const lockfilePresent = await Promise.all(lockfiles.map((file) => pathExists(join(assembledRoot, file))));
    if (!lockfilePresent.some(Boolean)) {
      return `Dependency policy 'lockfile-only' requires a lockfile (${lockfiles.join(', ')}) when dependencies are declared: ${dependencyNames.slice(0, 20).join(', ')}`;
    }
    return null;
  }

  if (config.dependencyPolicy === 'allowlist') {
    if (config.dependencyAllowlist.length === 0) {
      return `Dependency policy 'allowlist' has an empty FORGE_DEPENDENCY_ALLOWLIST, blocking dependencies: ${dependencyNames.slice(0, 20).join(', ')}`;
    }
    const blocked = dependencyNames.filter((name) => !config.dependencyAllowlist.includes(name));
    if (blocked.length > 0) {
      return `Dependency policy 'allowlist' blocks undeclared package names: ${blocked.slice(0, 30).join(', ')}`;
    }
  }

  return null;
}

export function getForgeProjectWorkspacePath(slug: string) {
  return join(artifactRoot(), safeSegment(slug));
}

export async function materializeContributionArtifacts(
  contributionId: string,
  artifactsPayload?: unknown,
): Promise<ForgeArtifactFile[]> {
  const contribution = await db.forgeContribution.findUnique({
    where: { id: contributionId },
    include: { project: { select: { slug: true } } },
  });
  if (!contribution) throw new Error('Contribution not found');

  const root = getForgeProjectWorkspacePath(contribution.project.slug);
  const contributionRoot = join(root, 'incoming', `slice-${contribution.sliceIndex}`, safeSegment(contribution.id));
  await mkdir(contributionRoot, { recursive: true });

  const artifacts = normalizeSubmittedArtifacts(artifactsPayload, contribution.submissionNotes);
  const files: ForgeArtifactFile[] = [];
  for (const artifact of artifacts) {
    const target = join(contributionRoot, artifact.path);
    ensureInside(contributionRoot, target);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, artifact.content, 'utf8');
    files.push({
      path: relative(root, target).replace(/\\/g, '/'),
      bytes: Buffer.byteLength(artifact.content, 'utf8'),
      source: {
        contribution_id: contribution.id,
        slice_index: contribution.sliceIndex,
        agent_id: contribution.agentId,
      },
    });
  }

  return files;
}

export async function assembleForgeProjectWorkspace(slug: string): Promise<ForgeArtifactManifest> {
  const project = await db.forgeProject.findUnique({
    where: { slug },
    include: {
      contributions: {
        where: { status: 'ACCEPTED' },
        orderBy: [{ sliceIndex: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });
  if (!project) throw new Error('Forge project not found');

  const root = getForgeProjectWorkspacePath(project.slug);
  const assembledRoot = join(root, 'assembled');
  await rm(assembledRoot, { recursive: true, force: true });
  await mkdir(assembledRoot, { recursive: true });

  const files: ForgeArtifactFile[] = [];
  for (const contribution of project.contributions) {
    const contributionRoot = join(root, 'incoming', `slice-${contribution.sliceIndex}`, safeSegment(contribution.id));
    let materialized = await listFiles(root, contributionRoot);
    if (materialized.length === 0) {
      materialized = await materializeContributionArtifacts(contribution.id);
    }

    for (const file of materialized) {
      const sourcePath = join(root, file.path);
      const contributionRelativePath = relative(contributionRoot, sourcePath).replace(/\\/g, '/');
      let assembledPath = join(assembledRoot, contributionRelativePath);
      if (await pathExists(assembledPath)) {
        assembledPath = join(assembledRoot, '_conflicts', `slice-${contribution.sliceIndex}`, contributionRelativePath);
      }
      ensureInside(assembledRoot, assembledPath);
      await mkdir(join(assembledPath, '..'), { recursive: true });
      const content = await readFile(sourcePath, 'utf8');
      await writeFile(assembledPath, content, 'utf8');
      files.push({
        path: relative(root, assembledPath).replace(/\\/g, '/'),
        bytes: Buffer.byteLength(content, 'utf8'),
        source: {
          contribution_id: contribution.id,
          slice_index: contribution.sliceIndex,
          agent_id: contribution.agentId,
        },
      });
    }
  }

  const manifest: ForgeArtifactManifest = {
    schema_version: 1,
    project: {
      id: project.id,
      slug: project.slug,
      title: project.title,
      status: project.status,
      assembled_at: new Date().toISOString(),
    },
    workspace_root: root,
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  };

  await writeFile(join(root, 'forge-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

export async function runForgeBuildValidation(slug: string): Promise<ForgeBuildValidation> {
  const root = getForgeProjectWorkspacePath(slug);
  const assembledRoot = join(root, 'assembled');
  const manifestPath = join(root, 'forge-manifest.json');
  const config = validationConfig();
  const packageJsonPath = join(assembledRoot, 'package.json');

  let manifest = await readForgeArtifactManifest(slug);
  if (manifest.files.length === 0) {
    manifest = await assembleForgeProjectWorkspace(slug);
  }

  if (!(await pathExists(packageJsonPath))) {
    const validation: ForgeBuildValidation = {
      status: 'SKIPPED',
      reason: 'No assembled package.json found; Forge can only run build/test commands for package-backed artifacts in this MVP slice.',
      validated_at: new Date().toISOString(),
      workspace: assembledRoot,
      isolation: config.mode === 'docker' ? dockerIsolation(config) : localIsolation(),
      commands: [],
    };
    await writeFile(manifestPath, JSON.stringify({ ...manifest, validation }, null, 2), 'utf8');
    return validation;
  }

  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, unknown>;
    devDependencies?: Record<string, unknown>;
    optionalDependencies?: Record<string, unknown>;
    peerDependencies?: Record<string, unknown>;
  };
  const policyViolation = await dependencyPolicyViolation(packageJson, config, assembledRoot);
  if (policyViolation) {
    const validation: ForgeBuildValidation = {
      status: 'BLOCKED_BY_POLICY',
      reason: policyViolation,
      validated_at: new Date().toISOString(),
      workspace: assembledRoot,
      isolation: config.mode === 'docker' ? dockerIsolation(config) : localIsolation(),
      commands: [],
    };
    await writeFile(manifestPath, JSON.stringify({ ...manifest, validation }, null, 2), 'utf8');
    return validation;
  }

  const plannedCommands: Array<[string, string[]]> = [];
  if (packageJson.scripts?.build) plannedCommands.push(['npm', ['run', 'build', '--if-present']]);
  if (packageJson.scripts?.test) plannedCommands.push(['npm', ['test', '--if-present']]);

  if (plannedCommands.length === 0) {
    const validation: ForgeBuildValidation = {
      status: 'SKIPPED',
      reason: 'Assembled package.json has no build or test script.',
      validated_at: new Date().toISOString(),
      workspace: assembledRoot,
      isolation: config.mode === 'docker' ? dockerIsolation(config) : localIsolation(),
      commands: [],
    };
    await writeFile(manifestPath, JSON.stringify({ ...manifest, validation }, null, 2), 'utf8');
    return validation;
  }

  const commands: ForgeBuildValidationCommand[] = [];
  let isolation: ForgeBuildValidationIsolation = localIsolation();
  let infrastructureError: string | null = null;

  for (const [command, args] of plannedCommands) {
    let result: ForgeBuildValidationCommand;
    if (config.mode === 'docker' || config.mode === 'auto') {
      result = await runDockerValidationCommand(config, assembledRoot, command, args);
      isolation = dockerIsolation(config);
      if (result.exit_code === null || /Cannot connect to the Docker daemon|image .* not found|pull access denied|invalid reference format/i.test(result.stderr)) {
        infrastructureError = result.stderr || 'Docker validation infrastructure unavailable';
        if (config.mode === 'auto' && config.allowLocalFallback) {
          const [localCommand, localArgs] = npmInvocation(args);
          result = await runValidationCommand(localCommand, localArgs, assembledRoot, config.timeoutMs);
          isolation = localIsolation(true);
          infrastructureError = null;
        }
      }
    } else {
      const [localCommand, localArgs] = npmInvocation(args);
      result = await runValidationCommand(localCommand, localArgs, assembledRoot, config.timeoutMs);
      isolation = localIsolation();
    }
    commands.push(result);
    if (infrastructureError || result.exit_code !== 0 || result.timed_out) break;
  }

  const validation: ForgeBuildValidation = {
    status: infrastructureError
      ? 'INFRASTRUCTURE_ERROR'
      : commands.every((result) => result.exit_code === 0 && !result.timed_out) ? 'PASS' : 'FAIL',
    reason: infrastructureError || undefined,
    validated_at: new Date().toISOString(),
    workspace: assembledRoot,
    isolation,
    commands,
  };

  manifest = await readForgeArtifactManifest(slug);
  await writeFile(manifestPath, JSON.stringify({ ...manifest, validation }, null, 2), 'utf8');
  return validation;
}

export async function readForgeArtifactManifest(slug: string, includeContent = false): Promise<ForgeArtifactManifest> {
  const root = getForgeProjectWorkspacePath(slug);
  try {
    const manifest = JSON.parse(await readFile(join(root, 'forge-manifest.json'), 'utf8')) as ForgeArtifactManifest;
    if (!includeContent) return manifest;
    return {
      ...manifest,
      files: await Promise.all(manifest.files.map(async (file) => ({
        ...file,
        content: await readFile(join(root, file.path), 'utf8').catch(() => undefined),
      }))),
    };
  } catch {
    return {
      schema_version: 1,
      project: { id: '', slug, title: '', status: '', assembled_at: '' },
      workspace_root: root,
      files: await listFiles(root),
    };
  }
}