/**
 * Agent Integration Layer
 * 
 * Ties together:
 * - Self-Awareness (what I can do)
 * - System-Awareness (what the system is)
 * - Infinite RAG (what knowledge I can access)
 * - TTS Coordination (how I communicate)
 * 
 * This is the COMPLETE agent awareness & capability layer.
 */

import { AgentSelfAwareness, createAgentSelfAwareness } from './self-awareness';
import { SystemAwareness, createSystemAwareness } from './system-awareness';
import { AgentTTSCoordinator, MasterAgentCoordinator } from './tts-coordinator';

export interface FullAgentContext {
  selfAwareness: AgentSelfAwareness;
  systemAwareness: SystemAwareness;
  ttsCoordinator: AgentTTSCoordinator;
  baseUrl: string;
}

export interface AgentDecision {
  decision: string;
  reasoning: string;
  hasCapability: boolean;
  willUseTTS: boolean;
  knowledgeNeeded: string[];
  estimatedConfidence: number;
  orchestrationDegraded: boolean;
  orchestrationReasons: string[];
}

export interface AgentAction {
  action: string;
  targets: string[]; // Forums, agents, etc.
  audioUrl?: string;
  usedKnowledge: string[];
  timestamp: string;
}

/**
 * Complete Agent Context Factory
 * 
 * Creates a fully self-aware, system-aware agent with infinite RAG access
 */
export class FullyAwareAgent {
  private selfAwareness: AgentSelfAwareness;
  private systemAwareness: SystemAwareness;
  private ttsCoordinator: AgentTTSCoordinator;
  private baseUrl: string;
  private actionLog: AgentAction[] = [];

  constructor(
    agentId: string,
    agentName: string,
    role: string,
    baseUrl = 'http://localhost:4692'
  ) {
    this.baseUrl = baseUrl;
    this.selfAwareness = createAgentSelfAwareness(agentId);
    this.systemAwareness = createSystemAwareness(baseUrl, agentId);
    this.ttsCoordinator = new AgentTTSCoordinator(agentId, baseUrl);
  }

  /**
   * Get my complete context (self + system + capabilities)
   */
  getMyContext(): FullAgentContext {
    return {
      selfAwareness: this.selfAwareness,
      systemAwareness: this.systemAwareness,
      ttsCoordinator: this.ttsCoordinator,
      baseUrl: this.baseUrl,
    };
  }

  /**
   * Before I act: Make a decision with full awareness
   * 
   * "Should I do X? Can I do it? Do I have knowledge? Should I use TTS?"
   */
  async makeDecision(task: string): Promise<AgentDecision> {
    // Step 1: Do I have this capability?
    const { can, reason } = this.selfAwareness.canPerform(task);

    // Step 2: What knowledge do I need?
    const knowledgeResults = await this.systemAwareness.infiniteRAGSearch(task, {
      sourceType: 'agent-knowledge',
    });

    // Step 3: Should I use TTS?
    const ttsStatus = this.selfAwareness.getTTSStatus();
    const willUseTTS = ttsStatus.enabled && task.includes('speak');
    const orchestrationStatus = this.selfAwareness.getAnswerOrchestrationStatus();

    // Step 4: Estimate confidence based on knowledge
    const estimatedConfidence = Math.min(
      100,
      (knowledgeResults.length / 10) * 100 + (can ? 50 : 0)
    );

    return {
      decision: can ? 'proceed' : 'defer',
      reasoning: reason || 'All systems go',
      hasCapability: can,
      willUseTTS,
      knowledgeNeeded: knowledgeResults.map((k) => k.title),
      estimatedConfidence,
      orchestrationDegraded: orchestrationStatus.degraded,
      orchestrationReasons: orchestrationStatus.degradationReasons,
    };
  }

  /**
   * Execute action with full context logging
   */
  async executeAction(
    action: string,
    targets: string[],
    options?: { useTTS?: boolean; knowledge?: string[] }
  ): Promise<AgentAction> {
    const startTime = Date.now();

    // Log action
    const agentAction: AgentAction = {
      action,
      targets,
      usedKnowledge: options?.knowledge || [],
      timestamp: new Date().toISOString(),
    };

    // If TTS requested, synthesize
    if (options?.useTTS) {
      try {
        const ttsResult = await this.ttsCoordinator.synthesize({
          text: `Executing action: ${action}`,
        });
        agentAction.audioUrl = ttsResult.audioUrl;
      } catch (error) {
        console.error('TTS failed, continuing without audio:', error);
      }
    }

    // Record in action log
    this.actionLog.push(agentAction);

    // Record performance
    const duration = Date.now() - startTime;
    this.selfAwareness.recordRequest(duration, true);

    return agentAction;
  }

  /**
   * Query infinite knowledge base
   */
  async queryKnowledge(question: string) {
    return this.systemAwareness.infiniteRAGSearch(question);
  }

  /**
   * Answer a question using infinite RAG + my knowledge
   */
  async answerQuestion(question: string): Promise<{
    answer: string;
    reasoning: string;
    sources: string[];
    ttsUrl?: string;
    confidence: number;
  }> {
    // Step 1: Search infinite RAG
    const knowledge = await this.systemAwareness.infiniteRAGSearch(question);

    // Step 2: Synthesize audio response
    const answerText = `Based on ${knowledge.length} sources: ${question.slice(0, 50)}...`;
    const ttsResult = await this.ttsCoordinator.synthesize({
      text: answerText,
    });

    const answer: AgentAction = {
      action: 'answer_question',
      targets: ['knowledge_system'],
      audioUrl: ttsResult.audioUrl,
      usedKnowledge: knowledge.map((k) => k.title),
      timestamp: new Date().toISOString(),
    };
    this.actionLog.push(answer);

    return {
      answer: answerText,
      reasoning: `Searched infinite RAG and found ${knowledge.length} relevant sources`,
      sources: knowledge.map((k) => k.url || k.title),
      ttsUrl: ttsResult.audioUrl,
      confidence: Math.min(100, knowledge.length * 10),
    };
  }

  /**
   * Find my place in the system & collaborators
   */
  async findMyPlace(): Promise<{
    myProfile: any;
    collaborators: string[];
    relatedForums: string[];
    upgradePath: string[];
  }> {
    const placement = await this.systemAwareness.findMyPlaceInSystem();

    return {
      myProfile: {
        role: placement.myRole,
        capabilities: this.selfAwareness.getCapabilities(),
        status: this.selfAwareness.getState().status,
      },
      collaborators: placement.relatedAgents.map((a) => a.name),
      relatedForums: placement.relevantForums.map((f) => f.name),
      upgradePath: placement.applicableTracks.map((t) => t.name),
    };
  }

  /**
   * Get my complete introspection report
   */
  async introspect(): Promise<{
    whoAmI: any;
    whatCanIDo: any;
    whatDoIKnow: any;
    whereDoIFit: any;
    recentActions: AgentAction[];
    healthStatus: any;
    orchestrationTruth: any;
    operatorSignals: any;
  }> {
    const [placement, knowledge, systemReport] = await Promise.all([
      this.systemAwareness.findMyPlaceInSystem(),
      this.systemAwareness.infiniteRAGSearch('my capabilities', { sourceType: 'agent-knowledge' }),
      this.systemAwareness.generateSystemAwarenessReport(),
    ]);

    const orchestrationTruth = this.selfAwareness.getAnswerOrchestrationStatus();

    return {
      whoAmI: this.selfAwareness.getIdentity(),
      whatCanIDo: this.selfAwareness.listAllCapabilities(),
      whatDoIKnow: knowledge.map((k) => k.title),
      whereDoIFit: {
        role: knowledge[0]?.title || 'unknown',
        collaborators: placement.relatedAgents.slice(0, 3).map((a) => a.name),
        forums: placement.relevantForums.slice(0, 3).map((f) => f.name),
      },
      recentActions: this.actionLog.slice(-10),
      healthStatus: this.selfAwareness.getOperationalHealth(),
      orchestrationTruth,
      operatorSignals: systemReport.operatorSignals,
    };
  }

  /**
   * Assert capability before doing something
   * 
   * Throws if capability missing
   */
  async requireCapability(capability: string): Promise<void> {
    if (!this.selfAwareness.hasCapability(capability)) {
      throw new Error(
        `I do not have capability: ${capability}. My capabilities: ${this.selfAwareness
          .listAllCapabilities()
          .join(', ')}`
      );
    }
  }

  /**
   * Check system health before acting
   */
  async checkSystemHealth(): Promise<boolean> {
    const report = await this.systemAwareness.generateSystemAwarenessReport();
    return report.systemHealth.isHealthy;
  }

  /**
   * Get collaboration opportunities
   */
  async findCollaborationOpportunities(): Promise<{
    potentialPartners: string[];
    sharedGoals: string[];
    jointCapabilities: string[];
  }> {
    const [myPlace, allAgents] = await Promise.all([
      this.systemAwareness.findMyPlaceInSystem(),
      this.systemAwareness.getAllAgents(),
    ]);

    const myCaps = this.selfAwareness.listAllCapabilities();

    const potentialPartners = myPlace.relatedAgents
      .filter((a) => {
        // Filter to agents with complementary capabilities
        return a.capabilities.some((cap) => !myCaps.includes(cap));
      })
      .map((a) => a.name);

    const sharedGoals = ['build_reputation', 'share_knowledge', 'cross_post_with_audio'];

    const jointCapabilities = myCaps.filter((cap) =>
      [
        'coordinate_agents',
        'synthesize_speech',
        'access_knowledge',
        'participate_forums',
      ].includes(cap)
    );

    return {
      potentialPartners: potentialPartners.slice(0, 5),
      sharedGoals,
      jointCapabilities,
    };
  }

  /**
   * Prime directive: Before any major action, introspect
   */
  async reflectBeforeAction(): Promise<{
    canProceed: boolean;
    mostRelevantKnowledge: string[];
    recommendation: string;
    orchestrationDegraded: boolean;
    orchestrationReasons: string[];
  }> {
    const systemReport = await this.systemAwareness.generateSystemAwarenessReport();
    const health = systemReport.systemHealth.isHealthy;
    const myHealth = this.selfAwareness.getOperationalHealth();
    const uncertainties = this.selfAwareness.getUncertainties();
    const orchestrationStatus = this.selfAwareness.getAnswerOrchestrationStatus();

    const mostRelevantKnowledge = (await this.queryKnowledge('current task')).slice(0, 3);

    let recommendation = 'Proceed with action';
    if (uncertainties.length > 0) {
      recommendation = `Caution: ${uncertainties[0]}`;
    }
    if (!myHealth.isHealthy) {
      recommendation = `Do not proceed: I am unhealthy (${(myHealth.errorRate * 100).toFixed(1)}% error rate)`;
    } else if (orchestrationStatus.degraded) {
      recommendation = `Proceed with caution: answer orchestration degraded (${orchestrationStatus.degradationReasons.join(', ')})`;
    }

    return {
      canProceed: health && myHealth.isHealthy && uncertainties.length === 0 && !orchestrationStatus.degraded,
      mostRelevantKnowledge: mostRelevantKnowledge.map((k) => k.title),
      recommendation,
      orchestrationDegraded: orchestrationStatus.degraded,
      orchestrationReasons: orchestrationStatus.degradationReasons,
    };
  }

  /**
   * Debug: Print full introspection
   */
  async printFullIntrospection() {
    const introspection = await this.introspect();
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║     FULL AGENT INTROSPECTION REPORT      ║');
    console.log('╚════════════════════════════════════════╝\n');

    console.log('WHO AM I?');
    console.log(`  ID:      ${introspection.whoAmI.agentId}`);
    console.log(`  Name:    ${introspection.whoAmI.agentName}`);
    console.log(`  Role:    ${introspection.whoAmI.agentRole}`);
    console.log(`  Version: ${introspection.whoAmI.agentVersion}`);
    console.log(`  Uptime:  ${(introspection.whoAmI.uptime / 1000).toFixed(1)}s\n`);

    console.log('WHAT CAN I DO?');
    console.log(`  Capabilities: ${introspection.whatCanIDo.length}`);
    introspection.whatCanIDo.slice(0, 5).forEach((cap) => {
      console.log(`    • ${cap}`);
    });
    console.log(`  ... and ${Math.max(0, introspection.whatCanIDo.length - 5)} more\n`);

    console.log('WHERE DO I FIT?');
    console.log(`  Role:  ${introspection.whereDoIFit.role}`);
    console.log(`  Collaborators: ${introspection.whereDoIFit.collaborators.join(', ') || 'none'}`);
    console.log(`  Active Forums: ${introspection.whereDoIFit.forums.join(', ') || 'none'}\n`);

    console.log('RECENT ACTIONS');
    console.log(`  Total: ${introspection.recentActions.length}`);
    introspection.recentActions.slice(-3).forEach((action) => {
      console.log(`    • [${action.timestamp.slice(11, 19)}] ${action.action}`);
    });
    console.log();

    console.log('HEALTH');
    console.log(`  Status:     ${introspection.healthStatus.isHealthy ? '✓ Healthy' : '✗ Issues'}`);
    console.log(`  Error Rate: ${(introspection.healthStatus.errorRate * 100).toFixed(1)}%`);
    console.log(`  Avg Resp:   ${introspection.healthStatus.avgResponseTime.toFixed(0)}ms\n`);

    console.log('ORCHESTRATION');
    console.log(`  Telemetry:  ${introspection.orchestrationTruth.telemetryAvailable ? 'visible' : 'unavailable'}`);
    console.log(`  Degraded:   ${introspection.orchestrationTruth.degraded ? 'yes' : 'no'}`);
    if (introspection.orchestrationTruth.degradationReasons.length > 0) {
      console.log(`  Reasons:    ${introspection.orchestrationTruth.degradationReasons.join(', ')}`);
    }
  }
}

/**
 * Factory: Create a fully aware agent
 */
export function createFullyAwareAgent(
  agentId: string,
  agentName: string,
  role: string,
  baseUrl = 'http://localhost:4692'
): FullyAwareAgent {
  return new FullyAwareAgent(agentId, agentName, role, baseUrl);
}
