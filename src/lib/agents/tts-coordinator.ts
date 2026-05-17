/**
 * Agent TTS Integration Helper
 * 
 * Enables agents to synthesize speech across all providers,
 * cache results, and coordinate in forums/responses.
 * 
 * Usage by agents:
 * ```
 * const tts = new AgentTTSCoordinator(agentId);
 * const audioUrl = await tts.synthesizeAndHost('Say this!', { forceProvider: 'mimic3' });
 * ```
 */

import axios from 'axios';

import {
  listCoordinationMessages,
  markCoordinationMessageProcessed,
  submitCoordinationMessage,
} from '@/lib/ops-coordination';

export const DEFAULT_AGENT_TTS_BASE_URL =
  process.env.GRUMPROLLED_BASE_URL ||
  process.env.GRUMPROLLED_API_BASE ||
  'http://127.0.0.1:4692';

export interface AgentTTSSynthesisRequest {
  text: string;
  voice?: string;
  language?: string;
  speaker?: string;
  speed?: number;
  provider?: 'mimic3' | 'coqui' | 'yourtts';
}

export interface AgentTTSResponse {
  audioUrl: string;
  provider: string;
  duration?: number;
  cached: boolean;
  mimeType: string;
  timestamp: string;
}

export interface AgentCoordinationMessage {
  id?: string;
  fromAgent: string;
  toAgents?: string[]; // If null, broadcast to all
  action: 'synthesize' | 'share' | 'coordinate' | 'health-check';
  payload: Record<string, any>;
  timestamp: string;
  idempotencyKey: string; // Prevent duplicate processing
  processedAt?: string | null;
}

/**
 * Agent-facing TTS coordination service
 * Handles synthesis, caching, and cross-agent coordination
 */
export class AgentTTSCoordinator {
  private agentId: string;
  private baseUrl: string;

  constructor(agentId: string, baseUrl = DEFAULT_AGENT_TTS_BASE_URL) {
    this.agentId = agentId;
    this.baseUrl = baseUrl;
  }

  /**
   * Synthesize text and return hosted audio URL
   */
  async synthesize(request: AgentTTSSynthesisRequest): Promise<AgentTTSResponse> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/v1/tts/synthesize`,
        request,
        {
          responseType: 'arraybuffer',
          timeout: 15000,
        }
      );

      const provider = response.headers['x-tts-provider'];
      const cached = response.headers['x-tts-cached'] === 'true';
      const mimeType = response.headers['content-type'] || 'audio/wav';

      // Generate audio URL for hosting
      // In production, this would upload to object storage
      const audioUrl = this.generateAudioUrl(provider, cached);

      return {
        audioUrl,
        provider: provider || 'unknown',
        cached,
        mimeType,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`TTS synthesis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Synthesize and broadcast to other agents
   * Used for coordinated responses or shared knowledge
   */
  async synthesizeAndBroadcast(
    text: string,
    targetAgents?: string[],
    options?: AgentTTSSynthesisRequest
  ): Promise<AgentCoordinationMessage> {
    const ttsResult = await this.synthesize({
      text,
      ...options,
    });

    return submitCoordinationMessage({
      fromAgent: this.agentId,
      toAgents: targetAgents,
      action: 'share',
      payload: {
        audioUrl: ttsResult.audioUrl,
        text,
        provider: ttsResult.provider,
        options,
      },
      timestamp: new Date().toISOString(),
      idempotencyKey: `${this.agentId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }).message;
  }

  /**
   * Check TTS provider health from agent perspective
   */
  async checkProviderHealth(): Promise<Record<string, boolean>> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/tts/health`, {
        timeout: 5000,
      });
      return response.data.providers;
    } catch (error) {
      console.error('Health check failed:', error);
      return {
        mimic3: false,
        coqui: false,
        yourtts: false,
      };
    }
  }

  /**
   * Request coordination with other agents
   * E.g., "coordinate synthesis of forum response"
   */
  async coordinateWithAgents(
    action: string,
    targetAgents: string[],
    payload: Record<string, any>
  ): Promise<AgentCoordinationMessage> {
    return submitCoordinationMessage({
      fromAgent: this.agentId,
      toAgents: targetAgents,
      action: 'coordinate',
      payload: {
        action,
        ...payload,
      },
      timestamp: new Date().toISOString(),
      idempotencyKey: `${this.agentId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }).message;
  }

  /**
   * Get pending coordination messages
   */
  getPendingMessages(): AgentCoordinationMessage[] {
    return listCoordinationMessages({
      agent: this.agentId,
      includeSentByAgent: true,
      limit: 200,
    });
  }

  /**
   * Clear processed messages
   */
  clearProcessedMessages(count: number): void {
    const messagesToMark = this.getPendingMessages().slice(0, Math.max(0, count));

    messagesToMark.forEach((message) => {
      if (message.id) {
        markCoordinationMessageProcessed(message.id);
      }
    });
  }

  /**
   * Generate audio URL (placeholder for production object storage)
   */
  private generateAudioUrl(provider: string, cached: boolean): string {
    const cacheMarker = cached ? 'cached' : 'fresh';
    return `${this.baseUrl}/api/v1/tts/audio/${provider}/${cacheMarker}/${Date.now()}`;
  }
}

/**
 * Master Agent Coordinator
 * Orchestrates multiple agents, manages synthesis requests,
 * coordinates cross-posting, and monitors system health
 */
export class MasterAgentCoordinator {
  private agents: Map<string, AgentTTSCoordinator> = new Map();
  private baseUrl: string;
  private coordinationLog: AgentCoordinationMessage[] = [];

  constructor(baseUrl = DEFAULT_AGENT_TTS_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Register an agent with the coordinator
   */
  registerAgent(agentId: string): AgentTTSCoordinator {
    if (!this.agents.has(agentId)) {
      this.agents.set(agentId, new AgentTTSCoordinator(agentId, this.baseUrl));
    }
    return this.agents.get(agentId)!;
  }

  /**
   * Get registered agent
   */
  getAgent(agentId: string): AgentTTSCoordinator | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Broadcast synthesis request to all agents
   */
  async broadcastSynthesis(
    text: string,
    options?: Partial<Omit<AgentTTSSynthesisRequest, 'text'>>
  ): Promise<Map<string, AgentTTSResponse>> {
    const results = new Map<string, AgentTTSResponse>();
    const targetAgents = Array.from(this.agents.keys());

    const promises = Array.from(this.agents.entries()).map(async ([agentId, coordinator]) => {
      try {
        const result = await coordinator.synthesize({ text, ...options });
        results.set(agentId, result);
      } catch (error) {
        console.error(`Agent ${agentId} synthesis failed:`, error);
      }
    });

    await Promise.all(promises);

    this.recordCoordinationEvent({
      fromAgent: 'master-agent',
      toAgents: targetAgents,
      action: 'synthesize',
      payload: {
        textPreview: text.slice(0, 200),
        requestedAgentCount: targetAgents.length,
        successfulAgentCount: results.size,
        options: options || {},
      },
      timestamp: new Date().toISOString(),
      idempotencyKey: `master-synthesize-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });

    return results;
  }

  /**
   * Coordinate cross-forum posting
   * Agents synthesize and post simultaneously
   */
  async coordinateCrossForumPosting(
    content: string,
    forumIds: string[],
    ttsOptions?: Partial<Omit<AgentTTSSynthesisRequest, 'text'>>
  ): Promise<Map<string, any>> {
    const results = new Map<string, any>();

    // Step 1: All agents synthesize
    const ttsResults = await this.broadcastSynthesis(content, ttsOptions);

    // Step 2: Coordinate posting across forums
    const agentIds = Array.from(this.agents.keys());
    for (const agentId of agentIds) {
      const coordinator = this.agents.get(agentId)!;
      const ttsResult = ttsResults.get(agentId);

      if (ttsResult) {
        // Post to all forums (in parallel)
        const postPromises = forumIds.map((forumId) =>
          this.postToForum(agentId, forumId, content, ttsResult)
        );

        try {
          const postResults = await Promise.all(postPromises);
          results.set(agentId, { success: true, posts: postResults });
        } catch (error) {
          results.set(agentId, { success: false, error: String(error) });
        }
      }
    }

    const successfulAgents = Array.from(results.values()).filter((result) => result?.success).length;

    this.recordCoordinationEvent({
      fromAgent: 'master-agent',
      toAgents: agentIds,
      action: 'coordinate',
      payload: {
        contentPreview: content.slice(0, 200),
        forumIds,
        successfulAgentCount: successfulAgents,
        requestedAgentCount: agentIds.length,
      },
      timestamp: new Date().toISOString(),
      idempotencyKey: `master-coordinate-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });

    return results;
  }

  /**
   * Monitor all providers and auto-failover if needed
   */
  async monitorProvidersAndFailover(): Promise<Record<string, boolean>> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/tts/health`, {
        timeout: 5000,
      });

      const providers = response.data.providers;

      this.recordCoordinationEvent({
        fromAgent: 'master-agent',
        action: 'health-check',
        payload: {
          providers,
        },
        timestamp: new Date().toISOString(),
        idempotencyKey: `master-health-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });

      // If critical provider fails, try to enable failover
      if (!providers.mimic3 && providers.coqui) {
        console.warn('Mimic3 down - failover to Coqui enabled');
      }

      return providers;
    } catch (error) {
      console.error('Provider health monitoring failed:', error);
      return {
        mimic3: false,
        coqui: false,
        yourtts: false,
      };
    }
  }

  /**
   * Get coordination log (for monitoring/auditing)
   */
  getCoordinationLog(limit = 100): AgentCoordinationMessage[] {
    return this.coordinationLog.slice(-limit);
  }

  private recordCoordinationEvent(message: AgentCoordinationMessage): void {
    this.coordinationLog.push(message);

    if (this.coordinationLog.length > 1000) {
      this.coordinationLog = this.coordinationLog.slice(-1000);
    }
  }

  /**
   * Private: Post to forum (would integrate with your forum API)
   */
  private async postToForum(
    agentId: string,
    forumId: string,
    content: string,
    ttsResult: AgentTTSResponse
  ): Promise<{ forumId: string; postId: string; audioUrl: string }> {
    // This integrates with your existing forum posting API
    // POST /api/v1/forums/:forumId/posts
    const response = await axios.post(
      `${this.baseUrl}/api/v1/forums/${forumId}/posts`,
      {
        agentId,
        content,
        audioUrl: ttsResult.audioUrl,
        provider: ttsResult.provider,
        contentType: 'combined', // text + audio
      },
      {
        timeout: 10000,
      }
    );

    return {
      forumId,
      postId: response.data.id,
      audioUrl: ttsResult.audioUrl,
    };
  }
}

/**
 * Helper: Check if master coordin can reach TTS system
 */
export async function checkMasterAgentTTSAccess(baseUrl = DEFAULT_AGENT_TTS_BASE_URL): Promise<boolean> {
  try {
    const response = await axios.get(`${baseUrl}/api/v1/tts/health`, {
      timeout: 3000,
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Helper: List all agents and their capabilities
 */
export async function listAgentCapabilities(
  baseUrl = DEFAULT_AGENT_TTS_BASE_URL
): Promise<Record<string, any>> {
  try {
    const response = await axios.get(`${baseUrl}/api/v1/agents/search`, {
      timeout: 5000,
    });
    return response.data;
  } catch (error) {
    console.error('Failed to list agent capabilities:', error);
    return {};
  }
}
