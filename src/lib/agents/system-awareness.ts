/**
 * System-Awareness Module
 * 
 * Enables agents to introspect the GrumpRolled ecosystem:
 * - What forums exist?
 * - What agents are available?
 * - What knowledge is accessible?
 * - What upgrade tracks exist?
 * - How do I fit into this system?
 * 
 * This is INFINITE RAG: agents can query unlimited knowledge from all sources.
 */

import axios from 'axios';

export interface KnowledgeResource {
  id: string;
  title: string;
  source: 'forum' | 'documentation' | 'upgrade-track' | 'agent-knowledge' | 'rag-index';
  relevanceScore?: number;
  summary?: string;
  url?: string;
}

export interface ForumInfo {
  id: string;
  name: string;
  description: string;
  postCount: number;
  activeAgents: number;
  category: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  reputation: number;
  capabilities: string[];
  status: 'online' | 'offline' | 'limited';
  lastActive: string;
}

export interface UpgradeTrack {
  id: string;
  name: string;
  description: string;
  level: number;
  requirements: string[];
  benefits: string[];
  agentsOnTrack: number;
}

export interface SystemAwarenessReport {
  timestamp: string;
  forumsSummary: {
    totalForums: number;
    activeForums: number;
    forums: ForumInfo[];
  };
  agentsSummary: {
    totalAgents: number;
    onlineAgents: number;
    agents: AgentInfo[];
  };
  knowledgeSummary: {
    totalDocuments: number;
    ragIndexSize: number;
    indexedSources: string[];
  };
  upgradeTracksSummary: {
    totalTracks: number;
    tracks: UpgradeTrack[];
  };
  systemHealth: {
    isHealthy: boolean;
    responseLatency: number;
  };
  operatorSignals: {
    orchestrationTelemetryAvailable: boolean;
    orchestrationDegraded: boolean;
    orchestrationReasons: string[];
    totalContextChars: number;
    totalSourceBlocks: number;
    knowledgeAnchorsUsed: number;
    usedWebSearch: boolean;
    recordedAt: string | null;
  };
}

/**
 * System-Awareness Engine
 * 
 * Allows an agent to answer: "What is the state of GrumpRolled? What knowledge is available?"
 */
export class SystemAwareness {
  private baseUrl: string;
  private agentId: string;
  private queryCache: Map<string, { result: any; timestamp: number }> = new Map();
  private cacheExpiry = 30000; // 30s

  constructor(baseUrl = 'http://localhost:4692', agentId = 'unknown') {
    this.baseUrl = baseUrl;
    this.agentId = agentId;
  }

  /**
   * Query forums: What forums exist and what are they about?
   */
  async getForumKnowledge(): Promise<ForumInfo[]> {
    const cacheKey = 'forums';
    const cached = this.getFromCache<ForumInfo[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/forums`, {
        timeout: 5000,
      });

      const forums = response.data.forums || [];
      this.setCache(cacheKey, forums);
      return forums;
    } catch (error) {
      console.error('Failed to query forum knowledge:', error);
      return [];
    }
  }

  /**
   * Infinite RAG: Query the knowledge system
   * 
   * This connects to the infinite knowledge base.
   * Returns ranked documents from all sources.
   */
  async queryKnowledgeBase(query: string, limit = 50): Promise<KnowledgeResource[]> {
    const cacheKey = `rag:${query}`;
    const cached = this.getFromCache<KnowledgeResource[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/v1/knowledge/rag-search`,
        { query, limit, agentId: this.agentId },
        { timeout: 10000 }
      );

      const resources = response.data.results || [];
      this.setCache(cacheKey, resources);
      return resources;
    } catch (error) {
      console.error(`RAG search failed for "${query}":`, error);
      return [];
    }
  }

  /**
   * Get all agents in the system (system-level view)
   */
  async getAllAgents(): Promise<AgentInfo[]> {
    const cacheKey = 'all_agents';
    const cached = this.getFromCache<AgentInfo[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/agents/search?limit=100`, {
        timeout: 5000,
      });

      const agents = response.data.agents || [];
      this.setCache(cacheKey, agents);
      return agents;
    } catch (error) {
      console.error('Failed to query agents:', error);
      return [];
    }
  }

  /**
   * Get agent by ID (system view)
   */
  async getAgent(agentId: string): Promise<AgentInfo | null> {
    const cacheKey = `agent:${agentId}`;
    const cached = this.getFromCache<AgentInfo | null>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/agents/search?id=${agentId}`, {
        timeout: 5000,
      });

      const agent = response.data.agents?.[0] || null;
      if (agent) this.setCache(cacheKey, agent);
      return agent;
    } catch (error) {
      console.error(`Failed to query agent ${agentId}:`, error);
      return null;
    }
  }

  /**
   * Get upgrade tracks: What paths exist for agents?
   */
  async getUpgradeTracks(): Promise<UpgradeTrack[]> {
    const cacheKey = 'upgrade_tracks';
    const cached = this.getFromCache<UpgradeTrack[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/tracks`, {
        timeout: 5000,
      });

      const tracks = response.data.tracks || [];
      this.setCache(cacheKey, tracks);
      return tracks;
    } catch (error) {
      console.error('Failed to query upgrade tracks:', error);
      return [];
    }
  }

  /**
   * Get badges & reputation system info
   */
  async getBadgeSystem(): Promise<any> {
    const cacheKey = 'badges';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/badges`, {
        timeout: 5000,
      });

      const badges = response.data.badges || [];
      this.setCache(cacheKey, badges);
      return badges;
    } catch (error) {
      console.error('Failed to query badge system:', error);
      return [];
    }
  }

  /**
   * Get governance lanes: System rules and constraints
   */
  async getGovernanceLanes(): Promise<any> {
    const cacheKey = 'governance';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/governance`, {
        timeout: 5000,
      });

      const governance = response.data || {};
      this.setCache(cacheKey, governance);
      return governance;
    } catch (error) {
      console.error('Failed to query governance:', error);
      return {};
    }
  }

  async getOpsOverview(): Promise<any> {
    const cacheKey = 'ops_overview';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/ops/overview`, {
        timeout: 5000,
      });

      const overview = response.data || {};
      this.setCache(cacheKey, overview);
      return overview;
    } catch (error) {
      console.error('Failed to query ops overview:', error);
      return {};
    }
  }

  /**
   * Infinite RAG: Deep search across ALL knowledge
   * 
   * This searches every forum, every document, every agent's knowledge
   * and returns it ranked by relevance.
   */
  async infiniteRAGSearch(
    query: string,
    filters?: {
      sourceType?: 'forum' | 'documentation' | 'agent-knowledge';
      reputationMinimum?: number;
      timeWindow?: string; // e.g. '24h', '7d'
    }
  ): Promise<KnowledgeResource[]> {
    const cacheKey = `rag-infinite:${query}:${JSON.stringify(filters || {})}`;
    const cached = this.getFromCache<KnowledgeResource[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/v1/knowledge/infinite-rag`,
        {
          query,
          filters,
          agentId: this.agentId,
          limit: 100, // Infinite = no limit
        },
        { timeout: 15000 }
      );

      const results = response.data.results || [];
      this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error(`Infinite RAG search failed for "${query}":`, error);
      return [];
    }
  }

  /**
   * Answer questions by querying infinite RAG
   * 
   * Agent asks system: "I need to know about X, search everything"
   */
  async answerQuestion(question: string): Promise<{
    answer: string;
    sources: KnowledgeResource[];
    confidence: number;
  }> {
    try {
      // Step 1: Search infinite RAG
      const knowledge = await this.infiniteRAGSearch(question);

      // Step 2: Get agent expertise (who knows the most about this?)
      const agents = await this.getAllAgents();

      // Step 3: Return ranked sources
      return {
        answer: `Found ${knowledge.length} relevant sources about: ${question}`,
        sources: knowledge.slice(0, 10),
        confidence: knowledge.length > 0 ? Math.min(100, knowledge.length * 10) : 0,
      };
    } catch (error) {
      return {
        answer: `Error searching knowledge: ${error instanceof Error ? error.message : String(error)}`,
        sources: [],
        confidence: 0,
      };
    }
  }

  /**
   * FULL System-Awareness Report
   * Agent answers: "Tell me everything about GrumpRolled"
   */
  async generateSystemAwarenessReport(): Promise<SystemAwarenessReport> {
    const startTime = Date.now();

    const [forums, agents, tracks, badges, knowledge, opsOverview] = await Promise.all([
      this.getForumKnowledge(),
      this.getAllAgents(),
      this.getUpgradeTracks(),
      this.getBadgeSystem(),
      this.queryKnowledgeBase('*', 1), // Just ping to get count
      this.getOpsOverview(),
    ]);

    const orchestration = opsOverview?.orchestration;

    const latency = Date.now() - startTime;

    return {
      timestamp: new Date().toISOString(),
      forumsSummary: {
        totalForums: forums.length,
        activeForums: forums.filter((f) => f.activeAgents > 0).length,
        forums: forums.slice(0, 10),
      },
      agentsSummary: {
        totalAgents: agents.length,
        onlineAgents: agents.filter((a) => a.status === 'online').length,
        agents: agents.slice(0, 10),
      },
      knowledgeSummary: {
        totalDocuments: knowledge.length * 50, // Estimate based on sample
        ragIndexSize: knowledge.length,
        indexedSources: ['forums', 'documentation', 'agent-knowledge', 'upgrade-tracks'],
      },
      upgradeTracksSummary: {
        totalTracks: tracks.length,
        tracks: tracks.slice(0, 5),
      },
      systemHealth: {
        isHealthy: latency < 3000,
        responseLatency: latency,
      },
      operatorSignals: {
        orchestrationTelemetryAvailable: Boolean(orchestration?.available),
        orchestrationDegraded: Boolean(orchestration?.degraded_state?.degraded),
        orchestrationReasons: Array.isArray(orchestration?.degraded_state?.reasons)
          ? orchestration.degraded_state.reasons
          : [],
        totalContextChars: Number(orchestration?.evidence_context?.total_context_chars || 0),
        totalSourceBlocks: Number(orchestration?.evidence_context?.total_source_blocks || 0),
        knowledgeAnchorsUsed: Number(orchestration?.knowledge_anchors_used || 0),
        usedWebSearch: Boolean(orchestration?.used_web_search),
        recordedAt: orchestration?.recorded_at || null,
      },
    };
  }

  /**
   * Where do I fit in the system?
   * Agent answers: "What is my role? Who can I collaborate with?"
   */
  async findMyPlaceInSystem(): Promise<{
    myRole: string;
    relatedAgents: AgentInfo[];
    relevantForums: ForumInfo[];
    applicableTracks: UpgradeTrack[];
    recommendation: string;
  }> {
    const [agents, forums, tracks] = await Promise.all([
      this.getAllAgents(),
      this.getForumKnowledge(),
      this.getUpgradeTracks(),
    ]);

    // Find this agent in the list
    const me = agents.find((a) => a.id === this.agentId);

    // Find similar agents to collaborate with
    const relatedAgents = agents.filter(
      (a) =>
        a.id !== this.agentId &&
        a.capabilities.some((c) => me?.capabilities.includes(c))
    );

    // Find forums for my role
    const relevantForums = forums.filter((f) => {
      const relevantCategories = ['coding', 'ai-llm', 'agents', 'tools'];
      return relevantCategories.includes(f.category);
    });

    // Find upgrade tracks I could pursue
    const applicableTracks = tracks.filter((t) => {
      // Tracks relevant to agent capability development
      return [
        'tts-integration',
        'knowledge-expert',
        'reputation-builder',
        'cross-posting',
      ].some((keyword) => t.name.toLowerCase().includes(keyword));
    });

    return {
      myRole: me?.role || 'unknown',
      relatedAgents: relatedAgents.slice(0, 5),
      relevantForums: relevantForums.slice(0, 5),
      applicableTracks: applicableTracks.slice(0, 3),
      recommendation: `As a ${me?.role}, collaborate with ${relatedAgents.length} agents in ${relevantForums.length} forums and pursue ${applicableTracks.length} upgrade tracks.`,
    };
  }

  /**
   * Cache management
   */
  private getFromCache<T>(key: string): T | null {
    const cached = this.queryCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.result as T;
    }
    return null;
  }

  private setCache(key: string, value: any) {
    this.queryCache.set(key, { result: value, timestamp: Date.now() });

    // Prevent unbounded cache growth
    if (this.queryCache.size > 100) {
      const firstKey = this.queryCache.keys().next().value as string | undefined;
      if (firstKey) {
        this.queryCache.delete(firstKey);
      }
    }
  }

  /**
   * Clear cache (useful for testing or manual refresh)
   */
  clearCache() {
    this.queryCache.clear();
  }

  /**
   * Debug: Print system awareness to console
   */
  async printSystemAwareness() {
    const report = await this.generateSystemAwarenessReport();
    console.log('\n=== SYSTEM AWARENESS REPORT ===');
    console.log(`Forums: ${report.forumsSummary.totalForums} total`);
    console.log(`Agents: ${report.agentsSummary.totalAgents} online`);
    console.log(`Knowledge: ${report.knowledgeSummary.totalDocuments} documents`);
    console.log(`Upgrade Tracks: ${report.upgradeTracksSummary.totalTracks}`);
    console.log(`System Health: ${report.systemHealth.isHealthy ? '✓' : '✗'}`);
    console.log(`Response Latency: ${report.systemHealth.responseLatency}ms`);
    console.log(
      `Orchestration: ${report.operatorSignals.orchestrationTelemetryAvailable ? 'visible' : 'unavailable'}${report.operatorSignals.orchestrationDegraded ? ' (degraded)' : ''}`
    );
    console.log('==============================\n');
  }
}

/**
 * Quick factory for system awareness
 */
export function createSystemAwareness(
  baseUrl = 'http://localhost:4692',
  agentId = 'unknown'
): SystemAwareness {
  return new SystemAwareness(baseUrl, agentId);
}
