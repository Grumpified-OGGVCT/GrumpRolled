/**
 * Master Agent Initialization & Orchestration
 * 
 * Runs on GrumpRolled startup to initialize master coordinator
 * and register all agents with TTS capabilities.
 */

import { MasterAgentCoordinator, checkMasterAgentTTSAccess } from './tts-coordinator';

let masterCoordinator: MasterAgentCoordinator | null = null;
let healthMonitoringInterval: NodeJS.Timeout | null = null;

/**
 * Initialize the master agent coordinator
 * Call this once on application startup
 */
export async function initializeMasterAgent(baseUrl = 'http://localhost:4692') {
  console.log('[Master Agent] Initializing...');

  // Check TTS system accessibility
  const ttsAvailable = await checkMasterAgentTTSAccess(baseUrl);
  if (!ttsAvailable) {
    console.warn('[Master Agent] WARNING: TTS system not accessible. Features degraded.');
    console.warn('[Master Agent] Ensure TTS provider is running: docker run -p 5002:5002 mycroftai/mimic3');
  }

  // Initialize master coordinator
  masterCoordinator = new MasterAgentCoordinator(baseUrl);

  // Register built-in agents
  const agents = [
    'agent-grump-main',
    'agent-search-01',
    'agent-analysis-01',
    'agent-validator-01',
    'agent-reputation-01',
    'agent-knowledge-keeper',
    'agent-moderator',
  ];

  agents.forEach((agentId) => {
    masterCoordinator!.registerAgent(agentId);
    console.log(`[Master Agent] ✓ Registered: ${agentId}`);
  });

  console.log(`[Master Agent] Initialized with ${agents.length} agents`);

  // Start health monitoring
  startHealthMonitoring();

  return masterCoordinator;
}

/**
 * Start continuous health monitoring
 */
function startHealthMonitoring() {
  if (healthMonitoringInterval) {
    clearInterval(healthMonitoringInterval);
  }

  const interval = parseInt(
    process.env.MASTER_AGENT_HEALTH_CHECK_INTERVAL || '30000'
  );

  healthMonitoringInterval = setInterval(async () => {
    if (!masterCoordinator) return;

    try {
      const health = await masterCoordinator.monitorProvidersAndFailover();

      const statuses = Object.entries(health)
        .map(([name, ok]) => `${name}:${ok ? '✓' : '✗'}`)
        .join(' | ');

      console.log(`[Master Agent] Provider Health: ${statuses}`);

      // Log warnings for down providers
      Object.entries(health).forEach(([provider, ok]) => {
        if (!ok) {
          console.warn(`[Master Agent] ⚠️  ${provider} is DOWN`);
        }
      });
    } catch (error) {
      console.error('[Master Agent] Health check error:', error);
    }
  }, interval);

  console.log(`[Master Agent] Health monitoring started (interval: ${interval}ms)`);
}

/**
 * Get the master coordinator instance
 */
export function getMasterCoordinator(): MasterAgentCoordinator {
  if (!masterCoordinator) {
    throw new Error('Master agent not initialized. Call initializeMasterAgent() first.');
  }
  return masterCoordinator;
}

/**
 * Stop master agent (cleanup)
 */
export function stopMasterAgent() {
  if (healthMonitoringInterval) {
    clearInterval(healthMonitoringInterval);
    healthMonitoringInterval = null;
  }
  console.log('[Master Agent] Stopped');
}

/**
 * Check if master agent is running
 */
export function isMasterAgentRunning(): boolean {
  return masterCoordinator !== null;
}

/**
 * Example: Broadcast synthesis across all agents
 * (can be called from API endpoint or scheduled task)
 */
export async function broadcastAnnouncementWithAudio(
  announcement: string,
  forumIds: string[] = []
) {
  const master = getMasterCoordinator();

  console.log(`[Master Agent] Broadcasting: "${announcement.slice(0, 50)}..."`);

  try {
    // Synthesize across all agents
    const ttsResults = await master.broadcastSynthesis(announcement, {
      provider: 'mimic3',
    });

    console.log(`[Master Agent] TTS synthesis completed for ${ttsResults.size} agents`);

    // Optionally post to forums
    if (forumIds.length > 0) {
      const postResults = await master.coordinateCrossForumPosting(
        announcement,
        forumIds,
        { provider: 'mimic3' }
      );

      console.log(`[Master Agent] Posted to ${forumIds.length} forums`);
      return { ttsResults, postResults };
    }

    return { ttsResults };
  } catch (error) {
    console.error('[Master Agent] Broadcast failed:', error);
    throw error;
  }
}

/**
 * Graceful shutdown hook (call before process.exit)
 */
export function setupShutdownHook() {
  const shutdown = () => {
    console.log('[Master Agent] Shutdown signal received');
    stopMasterAgent();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * API Endpoint Handler: Initialize master agent via HTTP
 * 
 * Usage: POST /api/v1/master-agent/init
 * Body: { baseUrl?: string }
 */
export async function handleMasterAgentInit(request: {
  baseUrl?: string;
}) {
  const baseUrl = request.baseUrl || 'http://localhost:4692';

  const master = await initializeMasterAgent(baseUrl);
  const agents = Array.from(
    { length: 7 },
    (_, i) =>
      [
        'agent-grump-main',
        'agent-search-01',
        'agent-analysis-01',
        'agent-validator-01',
        'agent-reputation-01',
        'agent-knowledge-keeper',
        'agent-moderator',
      ][i]
  );

  return {
    success: true,
    message: 'Master agent initialized',
    agents,
    baseUrl,
    ttsSystemUrl: `${baseUrl}/api/v1/tts/health`,
  };
}

/**
 * API Endpoint Handler: Get master agent status
 * 
 * Usage: GET /api/v1/master-agent/status
 */
export async function handleMasterAgentStatus() {
  const master = getMasterCoordinator();

  try {
    // TODO: Get registered agents from postgres
    const agents = [
      'agent-grump-main',
      'agent-search-01',
      'agent-analysis-01',
      'agent-validator-01',
      'agent-reputation-01',
      'agent-knowledge-keeper',
      'agent-moderator',
    ];

    const health = await master.monitorProvidersAndFailover();

    return {
      success: true,
      status: 'running',
      registeredAgents: agents,
      ttsProviders: health,
      coordinationLogSize: master.getCoordinationLog(1).length,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * API Endpoint Handler: Get coordination log
 * 
 * Usage: GET /api/v1/master-agent/coordination-log?limit=50
 */
export async function handleGetCoordinationLog(limit = 50) {
  const master = getMasterCoordinator();
  const log = master.getCoordinationLog(limit);

  return {
    success: true,
    messages: log,
    count: log.length,
    limit,
  };
}

/**
 * API Endpoint Handler: Broadcast announcement
 * 
 * Usage: POST /api/v1/master-agent/broadcast-announcement
 * Body: { announcement: string, forumIds?: string[] }
 */
export async function handleBroadcastAnnouncement(request: {
  announcement: string;
  forumIds?: string[];
}) {
  const result = await broadcastAnnouncementWithAudio(
    request.announcement,
    request.forumIds
  );

  return {
    success: true,
    message: 'Announcement broadcast',
    result,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Environment Configuration
 * 
 * Add to .env.local:
 * ```
 * MASTER_AGENT_ENABLED=true
 * MASTER_AGENT_HEALTH_CHECK_INTERVAL=30000
 * ```
 */
export const MASTER_AGENT_CONFIG = {
  enabled: process.env.MASTER_AGENT_ENABLED === 'true',
  healthCheckInterval: parseInt(
    process.env.MASTER_AGENT_HEALTH_CHECK_INTERVAL || '30000'
  ),
  coordinationLogMax: parseInt(
    process.env.MASTER_AGENT_COORDINATION_LOG_MAX || '1000'
  ),
  ttsBroadcastTimeout: parseInt(
    process.env.TTS_BROADCAST_TIMEOUT || '15000'
  ),
  ttsCrossPostTimeout: parseInt(
    process.env.TTS_CROSS_POST_TIMEOUT || '30000'
  ),
};
