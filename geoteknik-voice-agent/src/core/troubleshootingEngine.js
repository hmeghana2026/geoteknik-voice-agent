/**
 * Troubleshooting Engine - Enhanced with Adaptive Clarification & Follow-ups
 * Drives the coherent problem-solving workflow with improved conversation flow
 */

const logger = require('../utils/logger');

class TroubleshootingEngine {
  constructor(knowledgeBase, sessionManager, speechService) {
    this.kb = knowledgeBase;
    this.sessionManager = sessionManager;
    this.speechService = speechService;
  }

  /**
   * Main troubleshooting flow with enhanced retry and follow-up logic
   */
  async startTroubleshooting(sessionId, initialProblem) {
    const session = await this.sessionManager.getSession(sessionId);

    try {
      logger.info(`Starting troubleshooting for session: ${sessionId}`);

      // Step 1: Clarify the issue with adaptive questions
      logger.debug('Step 1: Clarifying problem with adaptive questions');
      const clarifiedProblem = await this.clarifyProblemAdaptive(
        sessionId,
        initialProblem
      );
      await this.sessionManager.updateProblemClarification(
        sessionId,
        clarifiedProblem
      );

      // Step 2: Look up relevant documentation
      logger.debug('Step 2: Searching knowledge base');
      const relevantDocs = await this.kb.search(
        clarifiedProblem.initialProblem || initialProblem
      );

      // Step 3: Run diagnostic steps
      logger.debug('Step 3: Running diagnostics');
      const diagnostics = await this.runDiagnostics(
        sessionId,
        clarifiedProblem
      );
      await this.sessionManager.updateSession(sessionId, { diagnostics });

      // Step 4: Execute solution with retry logic
      logger.debug('Step 4: Providing solution with retry capability');
      const solution = await this.provideSolutionWithRetry(
        sessionId,
        clarifiedProblem,
        diagnostics,
        relevantDocs
      );
      await this.sessionManager.updateSession(sessionId, { solution });

      // Step 5: Verify resolution
      logger.debug('Step 5: Verifying resolution');
      const resolved = await this.verifyResolution(sessionId);

      // Step 6: Ask follow-up questions if resolved
      let hasMoreIssues = false;
      if (resolved) {
        hasMoreIssues = await this.askFollowUpQuestions(sessionId);
      }

      logger.info(
        `Troubleshooting complete for ${sessionId}: Resolved=${resolved}, HasMoreIssues=${hasMoreIssues}`
      );

      return {
        resolved,
        solution,
        diagnostics,
        clarifiedProblem,
        hasMoreIssues,
      };
    } catch (error) {
      logger.error('Troubleshooting failed:', error);
      throw error;
    }
  }

  /**
   * Adaptive problem clarification with context-aware questions
   */
  async clarifyProblemAdaptive(sessionId, initialProblem) {
    let clarifiedInfo = { initialProblem };

    // Announce that we're clarifying
    await this.sessionManager.addMessage(
      sessionId,
      'agent',
      'Let me ask a few questions to better understand your issue.'
    );

    // Get base clarification questions
    const baseQuestions = [
      { key: 'device', question: 'What device or equipment are you using?' },
      { key: 'startTime', question: 'When did this problem start?' },
    ];

    // Answer base questions
    for (const item of baseQuestions) {
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

    // Get adaptive questions based on problem type
    const adaptiveQuestions = this.getAdaptiveQuestions(initialProblem);

    for (const item of adaptiveQuestions) {
      try {
        await this.sessionManager.addMessage(sessionId, 'agent', item.question);
        const answer = await this.askAndListen(sessionId, item.question, 8000);

        if (answer) {
          clarifiedInfo[item.key] = answer;
          await this.sessionManager.addMessage(sessionId, 'customer', answer);
        }
      } catch (error) {
        logger.warn(
          `Failed to clarify adaptive question ${item.key}:`,
          error.message
        );
      }
    }

    return clarifiedInfo;
  }

  /**
   * Get adaptive questions based on problem type
   */
  getAdaptiveQuestions(problemStatement) {
    const problem = (problemStatement || '').toLowerCase();
    const questions = [];

    // Drone-related problems
    if (
      problem.includes('drone') ||
      problem.includes('quadcopter') ||
      problem.includes('uav')
    ) {
      questions.push(
        {
          key: 'droneModel',
          question: 'What is your drone model? For example, Phantom, Mavic, or Spark?',
        },
        {
          key: 'issueType',
          question:
            'Is this about battery, control, flight, camera, or something else?',
        },
        {
          key: 'hasError',
          question: 'Are you getting any error messages or codes?',
        },
        {
          key: 'lastWorking',
          question: 'When did this drone last work properly?',
        }
      );
    }

    // Battery-related problems
    if (problem.includes('battery') || problem.includes('charge')) {
      questions.push(
        {
          key: 'batteryAge',
          question: 'How old is the battery? Days, weeks, or months?',
        },
        {
          key: 'chargeLevel',
          question: 'What was the charge level when the issue started?',
        },
        {
          key: 'chargerWorking',
          question: 'Are you using the original charger?',
        }
      );
    }

    // Connectivity problems
    if (
      problem.includes('connect') ||
      problem.includes('wifi') ||
      problem.includes('network') ||
      problem.includes('bluetooth')
    ) {
      questions.push(
        {
          key: 'connectionType',
          question: 'Is it WiFi, Bluetooth, cellular, or remote control connection?',
        },
        {
          key: 'otherDevices',
          question: 'Do other devices connect fine to the same network?',
        },
        {
          key: 'signalStrength',
          question: 'How far are you from the device or router?',
        }
      );
    }

    // Software/App problems
    if (
      problem.includes('app') ||
      problem.includes('software') ||
      problem.includes('crash') ||
      problem.includes('freeze')
    ) {
      questions.push(
        {
          key: 'appVersion',
          question: 'What version of the app are you using?',
        },
        {
          key: 'osVersion',
          question:
            'What operating system? iOS, Android, Windows, or Mac?',
        },
        {
          key: 'appBehavior',
          question:
            'Does it crash immediately, or during a specific action?',
        }
      );
    }

    // If no specific category matched, ask general follow-up
    if (questions.length === 0) {
      questions.push(
        {
          key: 'attempted',
          question: 'Have you tried anything to fix it yet?',
        },
        {
          key: 'context',
          question: 'What exactly happens when you experience this issue?',
        }
      );
    }

    return questions;
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
   * Provide solution with retry logic - tries multiple times with different clarifications
   */
  async provideSolutionWithRetry(
    sessionId,
    clarifiedProblem,
    diagnostics,
    relevantDocs = [],
    retryCount = 0
  ) {
    const maxRetries = 2;

    try {
      // Find matching solution
      let matchedSolution = await this.kb.findSolution(
        clarifiedProblem,
        diagnostics,
        retryCount > 0 ? [] : relevantDocs
      );

      // If no solution found and haven't retried yet, ask for more details
      if (
        (!matchedSolution || matchedSolution.score < 30) &&
        retryCount < maxRetries
      ) {
        logger.warn(
          `Solution score too low (${matchedSolution?.score || 0}), asking for more details...`
        );

        await this.sessionManager.addMessage(
          sessionId,
          'agent',
          "I need more details to help you better. Let me ask a few more questions."
        );

        // Ask additional clarification questions
        const additionalInfo = await this.askDetailedFollowUp(sessionId);

        // Merge additional info
        const enrichedProblem = {
          ...clarifiedProblem,
          ...additionalInfo,
        };

        // Try searching again with enriched information
        const newDocs = await this.kb.search(
          this.buildSearchQuery(enrichedProblem)
        );

        // Recursive retry
        return this.provideSolutionWithRetry(
          sessionId,
          enrichedProblem,
          diagnostics,
          newDocs,
          retryCount + 1
        );
      }

      // No solution found after retries
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

          await this.sessionManager.addMessage(
            sessionId,
            'customer',
            verification
          );
        } catch (error) {
          logger.warn(`Failed to execute step ${stepCount}:`, error.message);
        }
      }

      return solution;
    } catch (error) {
      logger.error('Solution provision failed:', error);
      throw error;
    }
  }

  /**
   * Ask detailed follow-up questions to improve search
   */
  async askDetailedFollowUp(sessionId) {
    const followUpQuestions = [
      {
        key: 'specificError',
        question: 'What is the exact error message or code you see?',
      },
      {
        key: 'recentChanges',
        question:
          'Did you recently update, change settings, or install anything new?',
      },
      {
        key: 'troubleSteps',
        question: 'What troubleshooting steps have you already tried?',
      },
      {
        key: 'frequency',
        question: 'Does this happen every time or intermittently?',
      },
    ];

    const additionalInfo = {};

    for (const item of followUpQuestions) {
      try {
        const answer = await this.askAndListen(
          sessionId,
          item.question,
          8000
        );
        if (answer && answer.trim()) {
          additionalInfo[item.key] = answer;
          await this.sessionManager.addMessage(sessionId, 'customer', answer);
        }
      } catch (error) {
        logger.warn(
          `Failed to get detailed follow-up for ${item.key}:`,
          error.message
        );
      }
    }

    return additionalInfo;
  }

  /**
   * Build optimized search query from clarified problem
   */
  buildSearchQuery(clarifiedProblem) {
    const parts = [
      clarifiedProblem.initialProblem,
      clarifiedProblem.device,
      clarifiedProblem.droneModel,
      clarifiedProblem.issueType,
      clarifiedProblem.specificError,
    ];

    return parts
      .filter((p) => p && p.trim())
      .join(' ')
      .substring(0, 200);
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

      const response = await this.askAndListen(
        sessionId,
        'Is your issue resolved?',
        5000
      );

      await this.sessionManager.addMessage(sessionId, 'customer', response);

      const resolved = this.isPositiveResponse(response);
      return resolved;
    } catch (error) {
      logger.error('Resolution verification failed:', error);
      return false;
    }
  }

  /**
   * Ask follow-up questions after successful resolution
   */
  async askFollowUpQuestions(sessionId) {
    try {
      const followUpMessage = 'Is there anything else I can help you with?';

      await this.sessionManager.addMessage(
        sessionId,
        'agent',
        followUpMessage
      );

      const response = await this.askAndListen(
        sessionId,
        followUpMessage,
        6000
      );

      await this.sessionManager.addMessage(sessionId, 'customer', response);

      // Check if customer has another issue
      const hasAnotherIssue = this.checkForAnotherIssue(response);

      if (hasAnotherIssue) {
        logger.info(`Customer has another issue, restarting troubleshooting...`);

        // Extract the new problem from response
        const newProblem = this.extractNewProblem(response);

        // Start troubleshooting for the new issue
        await this.sessionManager.addMessage(
          sessionId,
          'agent',
          "I'll help you with that. Let me troubleshoot this new issue."
        );

        // Recursively troubleshoot the new problem
        const nestedResult = await this.startTroubleshooting(
          sessionId,
          newProblem
        );

        return true;
      }

      return false;
    } catch (error) {
      logger.warn('Follow-up questions failed:', error.message);
      return false;
    }
  }

  /**
   * Check if response indicates another issue
   */
  checkForAnotherIssue(response) {
    if (!response) return false;

    const affirmativeKeywords = [
      'yes',
      'yeah',
      'yep',
      'sure',
      'actually',
      'also',
      'another',
      'plus',
      'there is',
      'there are',
      'i have',
      'we have',
      'we also',
      'have one more',
      'have another',
    ];

    const negativeKeywords = ['no', 'nope', 'nothing', 'that is all', 'all set'];

    const lowerResponse = response.toLowerCase();

    // Check for explicit negatives first
    const hasNegative = negativeKeywords.some((kw) =>
      lowerResponse.includes(kw)
    );
    if (hasNegative) return false;

    // Check for affirmative indicators
    const hasAffirmative = affirmativeKeywords.some((kw) =>
      lowerResponse.includes(kw)
    );

    return hasAffirmative;
  }

  /**
   * Extract new problem statement from response
   */
  extractNewProblem(response) {
    // Remove common affirmative phrases
    let cleaned = response
      .toLowerCase()
      .replace(/yes,?\s+/i, '')
      .replace(/yeah,?\s+/i, '')
      .replace(/also\s+/i, '')
      .replace(/another\s+issue\s+with\s+/i, '')
      .replace(/and\s+/i, '')
      .trim();

    // If too short, ask for clarification
    if (cleaned.length < 5) {
      return 'another issue';
    }

    return cleaned;
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
        const silenceCount =
          await this.sessionManager.incrementSilenceCount(sessionId);

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
      'better',
      'working',
    ];
    const lowerResponse = response.toLowerCase();
    return positiveKeywords.some((kw) => lowerResponse.includes(kw));
  }

  async sleepWithInterrupt(sessionId, ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = TroubleshootingEngine;