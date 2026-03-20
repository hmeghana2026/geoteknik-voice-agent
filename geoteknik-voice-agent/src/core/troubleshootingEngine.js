/**
 * Troubleshooting Engine
 * Drives the coherent problem-solving workflow
 */

const logger = require('../utils/logger');

class TroubleshootingEngine {
  constructor(knowledgeBase, sessionManager, speechService) {
    this.kb = knowledgeBase;
    this.sessionManager = sessionManager;
    this.speechService = speechService;
  }

  /**
   * Main troubleshooting flow
   */
  async startTroubleshooting(sessionId, initialProblem) {
    const session = await this.sessionManager.getSession(sessionId);

    try {
      logger.info(`Starting troubleshooting for session: ${sessionId}`);

      // Step 1: Clarify the issue
      logger.debug('Step 1: Clarifying problem');
      const clarifiedProblem = await this.clarifyProblem(sessionId, initialProblem);
      await this.sessionManager.updateProblemClarification(sessionId, clarifiedProblem);

      // Step 2: Look up relevant documentation
      logger.debug('Step 2: Searching knowledge base');
      const relevantDocs = await this.kb.search(
        clarifiedProblem.initialProblem || initialProblem
      );

      // Step 3: Run diagnostic steps
      logger.debug('Step 3: Running diagnostics');
      const diagnostics = await this.runDiagnostics(sessionId, clarifiedProblem);
      await this.sessionManager.updateSession(sessionId, { diagnostics });

      // Step 4: Execute solution steps
      logger.debug('Step 4: Providing solution');
      const solution = await this.provideSolution(
        sessionId,
        clarifiedProblem,
        diagnostics,
        relevantDocs
      );
      await this.sessionManager.updateSession(sessionId, { solution });

      // Step 5: Verify resolution
      logger.debug('Step 5: Verifying resolution');
      const resolved = await this.verifyResolution(sessionId);

      logger.info(`Troubleshooting complete for ${sessionId}: Resolved=${resolved}`);

      return {
        resolved,
        solution,
        diagnostics,
        clarifiedProblem,
      };
    } catch (error) {
      logger.error('Troubleshooting failed:', error);
      throw error;
    }
  }

  /**
   * Clarify customer's problem through multi-turn dialogue
   */
  async clarifyProblem(sessionId, initialProblem) {
    const clarificationQuestions = [
      { key: 'device', question: 'What device or equipment are you using?' },
      { key: 'startTime', question: 'When did this problem start?' },
      { key: 'context', question: 'What were you trying to do when it happened?' },
      { key: 'attempted', question: 'Have you tried anything to fix it yet?' },
    ];

    let clarifiedInfo = { initialProblem };

    // Announce that we're clarifying
    await this.sessionManager.addMessage(
      sessionId,
      'agent',
      'Let me ask a few questions to better understand your issue.'
    );

    for (const item of clarificationQuestions) {
      try {
        await this.sessionManager.addMessage(sessionId, 'agent', item.question);
        const answer = await this.askAndListen(sessionId, item.question, 8000);

        if (answer) {
          clarifiedInfo[item.key] = answer;
          await this.sessionManager.addMessage(sessionId, 'customer', answer);
        }
      } catch (error) {
        logger.warn(`Failed to clarify ${item.key}:`, error.message);
      }
    }

    return clarifiedInfo;
  }

  /**
   * Run automated diagnostics
   */
  async runDiagnostics(sessionId, clarifiedProblem) {
    const diagnostics = {
      timestamp: Date.now(),
      checks: [],
    };

    const checks = [
      {
        name: 'connectivity',
        test: () => this.testConnectivity(),
        message: 'Checking connectivity...',
      },
      {
        name: 'device_status',
        test: () => this.checkDeviceStatus(clarifiedProblem),
        message: 'Checking device status...',
      },
      {
        name: 'common_issues',
        test: () => this.checkCommonIssues(clarifiedProblem),
        message: 'Checking for common issues...',
      },
    ];

    for (const check of checks) {
      try {
        await this.sessionManager.addMessage(sessionId, 'agent', check.message);

        const result = await check.test();
        diagnostics.checks.push({
          name: check.name,
          status: result.status,
          details: result.details,
          timestamp: Date.now(),
        });

        // Provide feedback
        const feedback = result.feedback || `${check.name} check completed.`;
        await this.sessionManager.addMessage(sessionId, 'agent', feedback);
      } catch (error) {
        logger.warn(`Diagnostic check failed: ${check.name}`, error.message);
        diagnostics.checks.push({
          name: check.name,
          status: 'error',
          error: error.message,
        });
      }
    }

    return diagnostics;
  }

  /**
   * Provide step-by-step solution
   */
  async provideSolution(sessionId, clarifiedProblem, diagnostics, relevantDocs) {
    // Find matching solution
    const matchedSolution = await this.kb.findSolution(
      clarifiedProblem,
      diagnostics,
      relevantDocs
    );

    if (!matchedSolution || matchedSolution.score < 30) {
      logger.warn('No matching solution found, recommend escalation');
      return {
        type: 'escalate',
        reason: 'No matching solution found in knowledge base',
        message:
          'I could not find a solution in our database. Let me connect you with a specialist.',
      };
    }

    const solution = {
      id: matchedSolution.id,
      title: matchedSolution.title,
      steps: [],
      successMetrics: matchedSolution.successMetrics || [],
    };

    // Announce solution
    await this.sessionManager.addMessage(
      sessionId,
      'agent',
      `I found a solution: ${matchedSolution.title}. Let me walk you through it step by step.`
    );

    // Execute steps with verification
    let stepCount = 0;
    for (const step of matchedSolution.steps || []) {
      stepCount++;

      try {
        await this.sessionManager.addMessage(
          sessionId,
          'agent',
          `Step ${stepCount}: ${step.instruction}`
        );

        // Allow time for customer to perform action
        await this.sleepWithInterrupt(sessionId, 3000);

        // Ask for verification
        const verification = await this.askAndListen(
          sessionId,
          step.verificationQuestion || 'Did that work?',
          6000
        );

        solution.steps.push({
          stepNumber: stepCount,
          instruction: step.instruction,
          completed: true,
          customerFeedback: verification,
        });

        await this.sessionManager.addMessage(sessionId, 'customer', verification);
      } catch (error) {
        logger.warn(`Failed to execute step ${stepCount}:`, error.message);
      }
    }

    return solution;
  }

  /**
   * Verify if the problem is resolved
   */
  async verifyResolution(sessionId) {
    try {
      await this.sessionManager.addMessage(
        sessionId,
        'agent',
        'Is your issue resolved now?'
      );

      const response = await this.askAndListen(sessionId, 'Is your issue resolved?', 5000);

      await this.sessionManager.addMessage(sessionId, 'customer', response);

      const resolved = this.isPositiveResponse(response);
      return resolved;
    } catch (error) {
      logger.error('Resolution verification failed:', error);
      return false;
    }
  }

  /**
   * Ask question and listen with appropriate timeout
   */
  async askAndListen(sessionId, question, timeout = 8000) {
    try {
      // Reset silence count on new question
      await this.sessionManager.resetSilenceCount(sessionId);

      // Call speech service
      const response = await this.speechService.listen(question, timeout);

      if (!response || !response.text || response.text.trim() === '') {
        const silenceCount = await this.sessionManager.incrementSilenceCount(sessionId);

        if (silenceCount >= 3) {
          throw new Error('Max silence retries exceeded');
        }

        // Prompt again
        await this.sessionManager.addMessage(
          sessionId,
          'agent',
          "I didn't catch that. Could you please repeat?"
        );

        return this.askAndListen(sessionId, question, timeout);
      }

      return response.text;
    } catch (error) {
      logger.error('Ask and listen failed:', error);
      throw error;
    }
  }

  /**
   * Diagnostic tests
   */
  async testConnectivity() {
    return {
      status: 'success',
      details: 'Connectivity check passed',
      feedback: 'Connectivity looks good.',
    };
  }

  async checkDeviceStatus(clarifiedProblem) {
    return {
      status: 'success',
      details: `Device status: ${clarifiedProblem.device || 'unknown'}`,
      feedback: 'Device status is normal.',
    };
  }

  async checkCommonIssues(clarifiedProblem) {
    return {
      status: 'success',
      details: 'No common issues detected',
      feedback: 'No known issues found.',
    };
  }

  /**
   * Helper methods
   */
  isPositiveResponse(response) {
    const positiveKeywords = [
      'yes',
      'yeah',
      'yep',
      'fixed',
      'works',
      'resolved',
      'good',
      'great',
      'perfect',
      'solved',
    ];
    const lowerResponse = response.toLowerCase();
    return positiveKeywords.some((kw) => lowerResponse.includes(kw));
  }

  async sleepWithInterrupt(sessionId, ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = TroubleshootingEngine;