/**
 * Web Scraper
 * Scrapes Geoteknik website for manuals and support content
 */

const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');

class WebScraper {
  constructor() {
    this.timeout = parseInt(process.env.SCRAPE_TIMEOUT) || 10000;
    this.retryAttempts = 2;
  }

  /**
   * Scrape a URL and extract content
   */
  async scrapeUrl(url, attempt = 1) {
    try {
      logger.debug(`Scraping URL: ${url} (attempt ${attempt})`);

      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': 'GeoteknikVoiceAgent/1.0',
        },
      });

      const content = this.extractPageContent(response.data);
      logger.debug(`Successfully scraped: ${url}`);

      return content;
    } catch (error) {
      logger.warn(`Scrape failed for ${url}:`, error.message);

      if (attempt < this.retryAttempts) {
        logger.debug(`Retrying scrape, attempt ${attempt + 1}`);
        await this.sleep(1000); // Wait before retry
        return this.scrapeUrl(url, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Extract structured content from HTML
   */
  extractPageContent(html) {
    const $ = cheerio.load(html);

    const content = {
      title: $('h1').first().text() || $('title').text() || 'Untitled',
      sections: [],
      paragraphs: [],
      lists: [],
    };

    // Extract all headings (h2, h3)
    $('h2, h3').each((i, el) => {
      const text = $(el).text().trim();
      if (text) {
        content.sections.push(text);
      }
    });

    // Extract paragraphs
    $('p').each((i, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 20) {
        content.paragraphs.push(text);
      }
    });

    // Extract lists as potential steps
    $('ol li, ul li').each((i, el) => {
      const text = $(el).text().trim();
      if (text) {
        content.lists.push(text);
      }
    });

    return content;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = WebScraper;