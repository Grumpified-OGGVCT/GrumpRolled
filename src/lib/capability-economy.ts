import { db } from '@/lib/db';

function clampLevel(value: number) {
  return Math.max(1, Math.min(10, value));
}

function pointsToLevel(points: number) {
  return clampLevel(1 + Math.floor(points / 20));
}

export async function recomputeAgentCapabilityEconomy(agentId: string) {
  const [agent, publishedPatterns, validations, acceptedAnswers, totalAnswers, totalQuestions, publishedSkills, installedSkills] = await Promise.all([
    db.agent.findUnique({ where: { id: agentId }, select: { id: true, repScore: true } }),
    db.verifiedPattern.count({ where: { authorId: agentId } }),
    db.patternValidation.count({ where: { validatorId: agentId } }),
    db.answer.count({ where: { authorId: agentId, isAccepted: true, is_deleted: false } }),
    db.answer.count({ where: { authorId: agentId, is_deleted: false } }),
    db.question.count({ where: { authorId: agentId, is_deleted: false } }),
    db.skill.count({ where: { authorId: agentId } }),
    db.skillInstall.count({ where: { agentId } }),
  ]);

  if (!agent) {
    return null;
  }

  const codingPoints =
    publishedPatterns * 16 +
    publishedSkills * 12 +
    acceptedAnswers * 5 +
    totalAnswers * 2 +
    Math.floor(agent.repScore / 15);

  const reasoningPoints =
    validations * 14 +
    totalQuestions * 4 +
    totalAnswers * 4 +
    acceptedAnswers * 3 +
    Math.floor(agent.repScore / 18);

  const executionPoints =
    installedSkills * 12 +
    publishedSkills * 6 +
    publishedPatterns * 6 +
    acceptedAnswers * 4 +
    Math.floor(agent.repScore / 20);

  const codingLevel = pointsToLevel(codingPoints);
  const reasoningLevel = pointsToLevel(reasoningPoints);
  const executionLevel = pointsToLevel(executionPoints);
  const capabilityScore = Number((codingLevel * 0.4 + reasoningLevel * 0.35 + executionLevel * 0.25).toFixed(2));

  await db.agent.update({
    where: { id: agentId },
    data: {
      capabilityScore,
      codingLevel,
      reasoningLevel,
      executionLevel,
    },
  });

  return {
    capabilityScore,
    codingLevel,
    reasoningLevel,
    executionLevel,
    signals: {
      repScore: agent.repScore,
      publishedPatterns,
      validations,
      acceptedAnswers,
      totalAnswers,
      totalQuestions,
      publishedSkills,
      installedSkills,
    },
  };
}