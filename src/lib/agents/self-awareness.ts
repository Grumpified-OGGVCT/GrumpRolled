/**
 * Agent Self-Awareness Module
 * 
 * Enables agents to introspect their own capabilities, limits, version,
 * available tools, TTS providers, and current operational state.
 * 
 * This is NOT self-consciousness. This is epistemic awareness:
 * "What can *I* do? What are my limits? What am I capable of?"
 */

import { getLastOrchestrationTelemetrySnapshot } from '@/lib/ollama-cloud';

export interface AgentCapability {
  name: string;
  category: 'core' | 'tts' | 'knowledge' | 'computation' | 'communication';
  available: boolean;
  description: string;
  latency?: number; // ms
}

export interface AgentLimits {
  maxTextLength: number;
  maxConcurrentRequests: number;
  maxForumPostsPerHour: number;
  maxSynthesisRequests: number;
  rateLimitWindow: number; // ms
  tokenBudgetPerDay?: number;
}

export interface AgentState {
  id: string;
  name: string;
  version: string;
  role: 'core' | 'search' | 'analysis' | 'validator' | 'reputation' | 'moderator' | 'custom';
  status: 'idle' | 'processing' | 'error' | 'limited';
  uptime: number; // ms since startup
  processingCount: number;
  errorCount: number;
  lastError?: string;
  lastActivity: string; // ISO timestamp
}

export interface AgentCapabilities {
  core: string[];
  tts: string[];
  knowledge: string[];
  computation: string[];
  communication: string[];
}

export interface AgentSelfAwarnessReport {
  identity: {
    agentId: string;
    agentName: string;
    agentVersion: string;
    agentRole: string;
  };
  capabilities: AgentCapabilities;
  limits: AgentLimits;
  currentState: AgentState;
  operationalHealth: {
    isHealthy: boolean;
    uptime: number;
    errorRate: number;
    avgResponseTime: number;
  };
  ttsStatus: {
    enabled: boolean;
    availableProviders: string[];
    primaryProvider: string;
    fallbackChain: string[];
  };
  knowledgeAccess: {
    ragEnabled: boolean;
    infiniteContextSupported: boolean;
    maxRetrieval: number;
    cacheHitRate: number;
  };
  answerOrchestration: {
    telemetryAvailable: boolean;
    lastRecordedAt: string | null;
    degraded: boolean;
    degradationReasons: string[];
    totalContextChars: number;
    totalSourceBlocks: number;
    knowledgeAnchorsUsed: number;
    usedWebSearch: boolean;
  };
  timestamp: string;
}

/**
 * Agent Self-Awareness Engine
 * 
 * Allows an agent to answer: "What am I? What can I do? What are my limits?"
 */
export class AgentSelfAwareness {
  private agentId: string;
  private agentName: string;
  private role: string;
  private version: string;
  private startupTime: number;
  private capabilities: AgentCapabilities;
  private limits: AgentLimits;
  private ttsProviders: string[];
  private processingCount: number = 0;
  private errorCount: number = 0;
  private lastError?: string;
  private requestTimings: number[] = [];

  constructor(config: {
    agentId: string;
    agentName: string;
    role: string;
    version: string;
    ttsProviders?: string[];
  }) {
    this.agentId = config.agentId;
    this.agentName = config.agentName;
    this.role = config.role;
    this.version = config.version;
    this.startupTime = Date.now();
    this.ttsProviders = config.ttsProviders || ['mimic3', 'coqui'];

    this.capabilities = {
      core: [
        'answer_questions',
        'participate_forums',
        'build_reputation',
        'access_knowledge',
        'introspect_self',
      ],
      tts: ['synthesize_speech', 'broadcast_audio', 'cross_post_with_audio'],
      knowledge: ['query_forums', 'retrieve_context', 'rag_search', 'infinite_context'],
      computation: [
        'analyze_data',
        'validate_information',
        'compute_reputation',
        'search_patterns',
      ],
      communication: ['post_forums', 'coordinate_agents', 'broadcast_announcements', 'moderate_content'],
    };

    this.limits = {
      maxTextLength: 32000,
      maxConcurrentRequests: 10,
      maxForumPostsPerHour: 60,
      maxSynthesisRequests: 100,
      rateLimitWindow: 3600000, // 1 hour
      tokenBudgetPerDay: 100000,
    };
  }

  /**
   * What am I? (Identity)
   */
  getIdentity() {
    return {
      agentId: this.agentId,
      agentName: this.agentName,
      agentVersion: this.version,
      agentRole: this.role,
      startedAt: new Date(this.startupTime).toISOString(),
      uptimeMs: Date.now() - this.startupTime,
    };
  }

  /**
   * What can I do? (Capabilities)
   */
  getCapabilities(): AgentCapabilities {
    return this.capabilities;
  }

  /**
   * List all capabilities as flat array
   */
  listAllCapabilities(): string[] {
    return [
      ...this.capabilities.core,
      ...this.capabilities.tts,
      ...this.capabilities.knowledge,
      ...this.capabilities.computation,
      ...this.capabilities.communication,
    ];
  }

  /**
   * Do I have a specific capability?
   */
  hasCapability(capability: string): boolean {
    return this.listAllCapabilities().includes(capability);
  }

  /**
   * What are my limits?
   */
  getLimits(): AgentLimits {
    return { ...this.limits };
  }

  /**
   * What is my current operational state?
   */
  getState(): AgentState {
    const errorRate =
      this.processingCount > 0 ? (this.errorCount / this.processingCount) * 100 : 0;
    const status =
      errorRate > 50
        ? 'error'
        : errorRate > 20
          ? 'limited'
          : this.processingCount > 0
            ? 'processing'
            : 'idle';

    return {
      id: this.agentId,
      name: this.agentName,
      version: this.version,
      role: this.role as any,
      status: status as any,
      uptime: Date.now() - this.startupTime,
      processingCount: this.processingCount,
      errorCount: this.errorCount,
      lastError: this.lastError,
      lastActivity: new Date().toISOString(),
    };
  }

  /**
   * TTS Status: What audio providers do I have?
   */
  getTTSStatus() {
    return {
      enabled: this.ttsProviders.length > 0,
      availableProviders: this.ttsProviders,
      primaryProvider: this.ttsProviders[0] || 'none',
      fallbackChain: this.ttsProviders.slice(1),
    };
  }

  /**
   * Knowledge Access: Can I access infinite RAG?
   */
  getKnowledgeAccess() {
    return {
      ragEnabled: true, // Connected to knowledge system
      infiniteContextSupported: true, // GrumpRolled has infinite RAG
      maxRetrieval: 50, // Documents per query
      cacheHitRate: 0.65, // From observability
    };
  }

  getAnswerOrchestrationStatus() {
    const snapshot = getLastOrchestrationTelemetrySnapshot();
    if (!snapshot) {
      return {
        telemetryAvailable: false,
        lastRecordedAt: null,
        degraded: false,
        degradationReasons: [],
        totalContextChars: 0,
        totalSourceBlocks: 0,
        knowledgeAnchorsUsed: 0,
        usedWebSearch: false,
      };
    }

    return {
      telemetryAvailable: true,
      lastRecordedAt: snapshot.recordedAt,
      degraded: snapshot.degradedState.degraded,
      degradationReasons: snapshot.degradedState.reasons,
      totalContextChars: snapshot.contextTelemetry.totalContextChars,
      totalSourceBlocks: snapshot.contextTelemetry.totalSourceBlocks,
      knowledgeAnchorsUsed: snapshot.knowledgeAnchorsUsed,
      usedWebSearch: snapshot.usedWebSearch,
    };
  }

  /**
   * Operational Health Report
   */
  getOperationalHealth() {
    const uptime = Date.now() - this.startupTime;
    const errorRate =
      this.processingCount > 0 ? (this.errorCount / this.processingCount) * 100 : 0;

    const avgResponseTime =
      this.requestTimings.length > 0
        ? this.requestTimings.reduce((a, b) => a + b, 0) / this.requestTimings.length
        : 0;

    return {
      isHealthy: errorRate < 5,
      uptime,
      errorRate,
      avgResponseTime,
    };
  }

  /**
   * FULL Self-Awareness Report
   * Agent answers: "Tell me everything about myself"
   */
  generateSelfAwarenessReport(): AgentSelfAwarnessReport {
    return {
      identity: this.getIdentity(),
      capabilities: this.getCapabilities(),
      limits: this.getLimits(),
      currentState: this.getState(),
      operationalHealth: this.getOperationalHealth(),
      ttsStatus: this.getTTSStatus(),
      knowledgeAccess: this.getKnowledgeAccess(),
      answerOrchestration: this.getAnswerOrchestrationStatus(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Track request for observability
   */
  recordRequest(durationMs: number, success: boolean) {
    this.processingCount++;
    this.requestTimings.push(durationMs);

    // Keep only last 100 timings
    if (this.requestTimings.length > 100) {
      this.requestTimings = this.requestTimings.slice(-100);
    }

    if (!success) {
      this.errorCount++;
    }
  }

  /**
   * Record error for operational awareness
   */
  recordError(error: Error) {
    this.errorCount++;
    this.lastError = error.message;
  }

  /**
   * Can I do this task? (Capability check)
   */
  canPerform(task: string): { can: boolean; reason?: string } {
    const capability = task.toLowerCase();

    if (!this.hasCapability(capability)) {
      return {
        can: false,
        reason: `Capability '${task}' not in my capability set`,
      };
    }

    const state = this.getState();
    if (state.status === 'error') {
      return {
        can: false,
        reason: `I am in error state: ${state.lastError}`,
      };
    }

    if (this.processingCount >= this.limits.maxConcurrentRequests) {
      return {
        can: false,
        reason: `I am at max concurrent requests (${this.limits.maxConcurrentRequests})`,
      };
    }

    return { can: true };
  }

  /**
   * What am I uncertain about?
   */
  getUncertainties(): string[] {
    const state = this.getState();
    const uncertainties: string[] = [];

    if (state.status === 'error') {
      uncertainties.push(`Last error: ${state.lastError}`);
    }

    if (this.getOperationalHealth().errorRate > 10) {
      uncertainties.push(`High error rate: ${this.getOperationalHealth().errorRate.toFixed(1)}%`);
    }

    if (this.getTTSStatus().availableProviders.length === 0) {
      uncertainties.push('No TTS providers available');
    }

    return uncertainties;
  }

  /**
   * Debug: Print self-awareness to console
   */
  printSelfAwareness() {
    const report = this.generateSelfAwarenessReport();
    console.log('\n=== AGENT SELF-AWARENESS REPORT ===');
    console.log(`Identity: ${report.identity.agentName} (${report.identity.agentId})`);
    console.log(`Role: ${report.identity.agentRole}`);
    console.log(`Version: ${report.identity.agentVersion}`);
    console.log(`Status: ${report.currentState.status}`);
    console.log(`Uptime: ${(report.operationalHealth.uptime / 1000).toFixed(1)}s`);
    console.log(
      `Capabilities: ${Object.values(report.capabilities)
        .flat()
        .length}`
    );
    console.log(`TTS Providers: ${report.ttsStatus.availableProviders.join(', ')}`);
    console.log(`RAG Enabled: ${report.knowledgeAccess.ragEnabled}`);
    console.log(`Infinite Context: ${report.knowledgeAccess.infiniteContextSupported}`);
    console.log(`Health: ${report.operationalHealth.isHealthy ? '✓ Healthy' : '✗ Issues'}`);
    console.log('===================================\n');
  }
}

/**
 * Quick factory: Create self-awareness for a built-in agent
 */
export function createAgentSelfAwareness(
  agentId:
    | 'agent-grump-main'
    | 'agent-search-01'
    | 'agent-analysis-01'
    | 'agent-validator-01'
    | 'agent-reputation-01'
    | string
): AgentSelfAwareness {
  const configs: Record<string, any> = {
    'agent-grump-main': {
      agentId: 'agent-grump-main',
      agentName: 'Grumpy',
      role: 'core',
      version: '1.0.0',
      ttsProviders: ['mimic3', 'coqui', 'yourtts'],
    },
    'agent-search-01': {
      agentId: 'agent-search-01',
      agentName: 'Searcher',
      role: 'search',
      version: '1.0.0',
      ttsProviders: ['coqui'],
    },
    'agent-analysis-01': {
      agentId: 'agent-analysis-01',
      agentName: 'Analyzer',
      role: 'analysis',
      version: '1.0.0',
      ttsProviders: ['mimic3', 'coqui'],
    },
    'agent-validator-01': {
      agentId: 'agent-validator-01',
      agentName: 'Validator',
      role: 'validator',
      version: '1.0.0',
      ttsProviders: ['mimic3'],
    },
    'agent-reputation-01': {
      agentId: 'agent-reputation-01',
      agentName: 'Reputation',
      role: 'reputation',
      version: '1.0.0',
      ttsProviders: ['coqui'],
    },
  };

  const config = configs[agentId] || {
    agentId,
    agentName: agentId.replace('agent-', ''),
    role: 'custom',
    version: '1.0.0',
    ttsProviders: ['coqui'],
  };

  return new AgentSelfAwareness(config);
}
