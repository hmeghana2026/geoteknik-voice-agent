/**
 * Knowledge Base - Updated for Supabase
 */

const logger = require('../utils/logger');
const WebScraper = require('./webscraper');

class KnowledgeBase {
  constructor(database) {
    this.db = database;
    this.scraper = new WebScraper();
  }

  /**
   * Search for solutions
   */
  async search(query, options = {}) {
    try {
      logger.debug(`Searching knowledge base for: ${query}`);

      // Search database
      const dbResults = await this.searchDatabase(query);
      if (dbResults.length > 0) {
        logger.debug(`Found ${dbResults.length} results in database`);
        return dbResults;
      }

      // Web scraping fallback
      if (options.allowWebScraping !== false && process.env.ENABLE_WEB_SCRAPING === 'true') {
        logger.debug('No DB results, attempting web scrape');
        const webResults = await this.scrapeWebsite(query);

        if (webResults.length > 0) {
          await this.cacheResults(query, webResults);
          return webResults;
        }
      }

      logger.warn(`No results found for query: ${query}`);
      return [];
    } catch (error) {
      logger.error('Knowledge base search error:', error);
      return [];
    }
  }

  /**
   * Search Supabase
   */
  async searchDatabase(query) {
    try {
      const results = await this.db.searchSolutions(query);
      return results.map((r) => ({
        id: r.id,
        title: r.title,
        source: 'database',
        category: r.category,
        device_type: r.device_type,
        keywords: r.keywords,
        steps: r.steps || [],
        difficulty_level: r.difficulty_level,
        timestamp: r.created_at,
      }));
    } catch (error) {
      logger.error('Database search failed:', error);
      return [];
    }
  }

  /**
   * Scrape website
   */
  async scrapeWebsite(query) {
    try {
      const results = [];
      const searchPaths = ['/support', '/manuals', '/faq', '/knowledge-base', '/products'];

      for (const path of searchPaths) {
        try {
          const content = await this.scraper.scrapeUrl(
            process.env.GEOTEKNIK_WEBSITE_URL + path
          );

          if (this.matchesQuery(content, query)) {
            results.push({
              id: null,
              title: content.title,
              source: 'website',
              category: path,
              content: content.sections,
              url: process.env.GEOTEKNIK_WEBSITE_URL + path,
              timestamp: Date.now(),
              steps: this.extractSteps(content),
            });
          }
        } catch (err) {
          logger.warn(`Failed to scrape ${path}:`, err.message);
        }
      }

      logger.debug(`Scraped ${results.length} results from website`);
      return results;
    } catch (error) {
      logger.error('Website scraping failed:', error);
      return [];
    }
  }

  /**
   * Find best matching solution
   */
  async findSolution(problem, diagnostics, relevantDocs = []) {
    try {
      const solutions = relevantDocs.length > 0
        ? relevantDocs
        : await this.search(problem.initialProblem || '');

      if (solutions.length === 0) {
        logger.warn('No solutions found');
        return null;
      }

      const scoredSolutions = solutions.map((sol) =>
        this.calculateRelevanceScore(sol, problem, diagnostics)
      );

      scoredSolutions.sort((a, b) => b.score - a.score);
      const topMatch = scoredSolutions[0];

      logger.debug(`Best match score: ${topMatch.score}, Solution: ${topMatch.title}`);
      return topMatch;
    } catch (error) {
      logger.error('Find solution failed:', error);
      return null;
    }
  }

  /**
   * Calculate relevance score
   */
  calculateRelevanceScore(solution, problem, diagnostics) {
    let score = 0;

    if (solution.title && solution.title.toLowerCase().includes(
      (problem.initialProblem || '').toLowerCase()
    )) {
      score += 40;
    }

    if (problem.device && solution.device_type === problem.device) {
      score += 25;
    }

    if (solution.keywords && problem.initialProblem) {
      const keywordMatches = solution.keywords
        .split(',')
        .filter((kw) =>
          problem.initialProblem.toLowerCase().includes(kw.toLowerCase())
        ).length;
      score += keywordMatches * 10;
    }

    if (solution.difficulty_level === 'easy') {
      score += 15;
    }

    return { ...solution, score };
  }

  /**
   * Cache results to Supabase
   */
  async cacheResults(query, results) {
    try {
      for (const result of results) {
        if (result.steps && result.steps.length > 0) {
          await this.db.upsertSolution({
            query,
            title: result.title,
            content: JSON.stringify(result),
            steps: result.steps,
            source: 'website',
            source_url: result.url,
          });
        }
      }

      logger.debug(`Cached ${results.length} results for query: ${query}`);
    } catch (error) {
      logger.warn('Caching results failed:', error.message);
    }
  }

  extractSteps(content) {
    const steps = [];
    if (content.sections && Array.isArray(content.sections)) {
      content.sections.forEach((section, index) => {
        steps.push({
          stepNumber: index + 1,
          instruction: section,
        });
      });
    }
    return steps;
  }

  matchesQuery(content, query) {
    const queryLower = query.toLowerCase();
    const contentStr = JSON.stringify(content).toLowerCase();
    return contentStr.includes(queryLower);
  }
}

module.exports = KnowledgeBase;