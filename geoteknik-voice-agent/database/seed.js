/**
 * Database Seeder for Supabase
 * Populates with sample solutions
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const logger = require('../src/utils/logger');

async function seedDatabase() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  try {
    logger.info('Seeding Supabase with sample solutions...');

    const solutions = [
      {
        title: 'Device Won\'t Start',
        category: 'troubleshooting',
        device_type: 'drilling-machine',
        keywords: 'start, power, device, not starting',
        steps: [
          { stepNumber: 1, instruction: 'Check if the device is plugged in and powered on' },
          { stepNumber: 2, instruction: 'Check the power button status indicator' },
          { stepNumber: 3, instruction: 'Try resetting by holding power button for 10 seconds' },
          { stepNumber: 4, instruction: 'Check if the control panel lights up' },
        ],
        difficulty_level: 'easy',
      },
      {
        title: 'Calibration Error',
        category: 'troubleshooting',
        device_type: 'drilling-machine',
        keywords: 'calibration, error, accuracy',
        steps: [
          { stepNumber: 1, instruction: 'Go to Settings > Calibration menu' },
          { stepNumber: 2, instruction: 'Select Recalibrate option' },
          { stepNumber: 3, instruction: 'Follow on-screen instructions to complete calibration' },
          { stepNumber: 4, instruction: 'Wait for calibration to complete (approximately 2 minutes)' },
        ],
        difficulty_level: 'medium',
      },
      {
        title: 'Connection Lost Error',
        category: 'troubleshooting',
        device_type: 'all',
        keywords: 'connection, network, lost, communication',
        steps: [
          { stepNumber: 1, instruction: 'Restart the device and control unit' },
          { stepNumber: 2, instruction: 'Check Ethernet or wireless connection' },
          { stepNumber: 3, instruction: 'Verify network settings in device configuration' },
          { stepNumber: 4, instruction: 'Perform factory reset if issue persists' },
        ],
        difficulty_level: 'medium',
      },
    ];

    const { data, error } = await supabase
      .from('solutions')
      .insert(solutions);

    if (error) {
      throw error;
    }

    logger.info(`✓ Seeded ${solutions.length} solutions to Supabase`);
  } catch (error) {
    logger.error('Database seeding failed:', error);
    throw error;
  }
}

seedDatabase().catch(() => process.exit(1));