#!/usr/bin/env node
/**
 * seedDemoKB-FIXED.js
 * ===================
 * Properly seeded Geoteknik demo knowledge base to Supabase
 * 
 * FIXED ISSUES:
 * - Uses .from().insert() instead of .rpc()
 * - Proper error handling
 * - Validates connection before seeding
 * - Clear status reporting
 * 
 * Usage:
 *   node seedDemoKB-FIXED.js
 * 
 * Requirements:
 *   - .env file with SUPABASE_URL and SUPABASE_SERVICE_KEY
 *   - demo_kb table must exist in Supabase
 */

'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Validate environment
if (!process.env.SUPABASE_URL) {
  console.error('❌ SUPABASE_URL not set in .env');
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY or SUPABASE_KEY not set in .env');
  console.error('   Get your SERVICE_KEY from Supabase Dashboard → Settings → API');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// Demo KB entries
const DEMO_KB = [
  {
    product: 'drone',
    keywords: ['drone', 'uav', 'quadcopter', 'fly', 'flight', 'not starting', 'wont start', 'won\'t start', 'not turning on', 'dead', 'power'],
    issue_title: 'Drone will not power on',
    steps: [
      'Check that the battery is fully charged. The LED indicator should show at least two solid green lights.',
      'Remove the battery and reinsert it firmly until you hear a click.',
      'Press and hold the power button for three full seconds. The drone should beep.',
      'If it still does not power on, try a different battery if you have one available.',
      'If none of these steps work, note your drone\'s serial number for our specialist team.',
    ],
  },

  {
    product: 'drone',
    keywords: ['drone', 'uav', 'compass', 'calibration', 'error', 'calibrate', 'compass error', 'heading', 'direction', 'magnetic'],
    issue_title: 'Drone compass calibration error',
    steps: [
      'Move the drone at least 10 metres away from any metal structures or vehicles.',
      'Open the Geoteknik flight app and navigate to Settings, then Aircraft, then Compass.',
      'Hold the drone horizontally and rotate it 360 degrees slowly until the app confirms.',
      'Then tilt the drone nose-down to vertical position and rotate it 360 degrees again.',
      'Wait for the green confirmation message in the app.',
    ],
  },

  {
    product: 'drone',
    keywords: ['drone', 'uav', 'video', 'camera', 'feed', 'image', 'live', 'black screen', 'no image', 'no video', 'fpv', 'screen'],
    issue_title: 'Drone camera feed not showing',
    steps: [
      'Check the cable connecting your remote controller to your phone or tablet.',
      'Close the Geoteknik app completely and reopen it. Do not just put it in the background.',
      'In the app, go to Camera Settings and verify the resolution is set to 1080p or lower.',
      'Power cycle the drone and remote controller together.',
      'Check for the orange foam padding under the camera and remove it if present.',
    ],
  },

  {
    product: 'drone',
    keywords: ['drone', 'uav', 'battery', 'draining', 'fast', 'short flight', 'flight time', 'low battery', 'percentage', 'drops quickly'],
    issue_title: 'Drone battery draining too fast',
    steps: [
      'Check the battery health in the app under Aircraft Settings, then Battery.',
      'Verify you are flying in appropriate conditions. Cold weather reduces battery capacity.',
      'Check the drone arms and propellers for any damage or dirt.',
      'Reduce the payload if you are carrying additional equipment.',
      'Perform a battery discharge cycle by flying until low battery warning.',
    ],
  },

  {
    product: 'gps',
    keywords: ['gps', 'gnss', 'receiver', 'satellite', 'signal', 'no fix', 'no signal', 'cannot find', 'satellites', 'positioning', 'rtk'],
    issue_title: 'GNSS receiver cannot acquire satellite fix',
    steps: [
      'Move to an open area with a clear view of the sky. You need at least 30 degrees of sky visibility.',
      'Wait 5 minutes after powering on for the receiver to download satellite data.',
      'Check the antenna connection. The connector should be finger-tight.',
      'In the receiver settings, verify that all constellations are enabled: GPS, GLONASS, Galileo, BeiDou.',
      'If attempting RTK, check that your NTRIP credentials are correct and mobile data is connected.',
    ],
  },

  {
    product: 'gps',
    keywords: ['gps', 'gnss', 'rtk', 'fixed', 'float', 'solution', 'accuracy', 'centimeter', 'precision', 'base station', 'rover'],
    issue_title: 'RTK not achieving fixed solution',
    steps: [
      'Confirm your base station is set up correctly over a known point with accurate coordinates.',
      'Check the radio link signal strength. You need at least 3 bars of signal.',
      'Ensure both the base and rover are tracking the same satellite systems.',
      'A fixed solution typically requires 5 or more common satellites between base and rover.',
      'Try restarting the RTK engine: go to Survey, then Reset RTK, wait 90 seconds.',
    ],
  },

  {
    product: 'gps',
    keywords: ['gps', 'gnss', 'bluetooth', 'connect', 'paired', 'pairing', 'controller', 'data collector', 'cannot connect', 'connection'],
    issue_title: 'GNSS receiver not connecting via Bluetooth',
    steps: [
      'On the data collector, go to Settings and then Bluetooth. Select the receiver and choose Forget Device.',
      'On the GNSS receiver, hold the Bluetooth button for 5 seconds until the LED flashes rapidly.',
      'On the data collector, scan for new Bluetooth devices and select the receiver from the list.',
      'When prompted for a PIN code, enter 1234 (the default for all South GNSS receivers).',
      'Open your survey software and create a new connection profile selecting the receiver.',
    ],
  },

  {
    product: 'total station',
    keywords: ['total station', 'theodolite', 'prism', 'reflector', 'edm', 'distance', 'measurement', 'error', 'cannot measure', 'lock', 'tracking', 'target', 'robotic'],
    issue_title: 'Total station cannot measure distance to prism',
    steps: [
      'Check that the prism is clean and facing directly toward the instrument.',
      'On the instrument display, verify the correct prism constant is set (typically minus 30 millimetres).',
      'Check the distance to your prism. Standard single-prism mode has a range of approximately 3 kilometres.',
      'Clean the EDM port on the total station with a dry lens cloth.',
      'Switch to reflectorless EDM mode temporarily and aim at a flat white wall nearby to test.',
    ],
  },

  {
    product: 'total station',
    keywords: ['total station', 'level', 'leveling', 'bubble', 'tilt', 'not level', 'tilt error', 'compensator', 'cant level'],
    issue_title: 'Total station showing tilt or levelling error',
    steps: [
      'Check that the tripod legs are firmly planted on stable ground.',
      'Loosen the tribrach screws and re-centre the circular bubble first using the three foot screws.',
      'Once the circular bubble is centred, use the electronic level display to fine-tune.',
      'Adjust the foot screws while watching the on-screen tilt indicator.',
      'If the compensator error persists, go to Menu then Instrument Settings then Compensator.',
    ],
  },

  {
    product: 'data collector',
    keywords: ['data collector', 'controller', 'handheld', 'field computer', 'software', 'crash', 'freezing', 'frozen', 'slow', 'restart', 'not responding'],
    issue_title: 'Data collector software freezing or crashing',
    steps: [
      'Perform a soft reset: hold the power button for 10 seconds until the device restarts.',
      'Check available storage space under Settings then Storage. If below 500 MB, delete old backups.',
      'Close all background applications. Use the recent apps button to close everything.',
      'If the survey software crashes on a specific project file, try opening a different project.',
      'Update the survey software to the latest version through Help then Check for Updates.',
    ],
  },

  {
    product: 'data collector',
    keywords: ['data collector', 'controller', 'sync', 'transfer', 'upload', 'download', 'file', 'import', 'export', 'usb', 'office'],
    issue_title: 'Cannot transfer files from data collector to office software',
    steps: [
      'Use the USB cable that came with the data collector, not a third-party cable.',
      'Connect directly to a USB port on the PC, not a USB hub.',
      'Check if Windows recognises the device in File Explorer under Portable Devices.',
      'On the data collector, when the USB connection prompt appears select File Transfer or MTP mode.',
      'As a fallback, export your project to the SD card and read it with a card reader on the PC.',
    ],
  },

  {
    product: 'laser scanner',
    keywords: ['laser', 'scanner', 'scan', 'point cloud', 'lidar', 'not scanning', 'scan error', 'registration', 'targets'],
    issue_title: 'Laser scanner not completing scan or producing errors',
    steps: [
      'Check that the scanner is level. Most scanners refuse to start if tilt exceeds 5 degrees.',
      'Ensure the lens is clean. Use the provided microfibre cloth and wipe gently.',
      'Verify that the target distance is within the specified range for your scan resolution setting.',
      'If you see Mirror Error on the display, the rotating mirror may be obstructed.',
      'For registration errors, ensure your scan targets were placed within the overlap area.',
    ],
  },

  // ── Geoteknik Software — License & Activation ──────────────────────────
  {
    product: 'Geoteknik Software',
    keywords: ['license', 'licence', 'activation', 'activate', '404-l', '404l', 'error', 'key', 'unlock', 'software', 'geoteknik', 'invalid', 'expired', 'not working'],
    issue_title: 'Geoteknik Software license activation error (404-L)',
    steps: [
      'Open Geoteknik Software and navigate to Help, then License Manager from the top menu.',
      'Click "Deactivate" to reset any stale activation on this machine, then click "Activate."',
      'Enter your license key exactly as provided in your purchase email — use copy and paste to avoid typos.',
      'Ensure your machine is connected to the internet during activation so the license server can verify your key.',
      'Restart the software after activation. Your license status should now show as Active.',
    ],
  },

  {
    product: 'Geoteknik Software',
    keywords: ['license', 'licence', 'transfer', 'move', 'new computer', 'new machine', 'another pc', 'deactivate', 'migrate', 'reinstall'],
    issue_title: 'Moving Geoteknik Software license to a new computer',
    steps: [
      'On your old computer, open Geoteknik Software and go to Help, then License Manager.',
      'Click "Deactivate" to release the license — this frees it for use on another machine.',
      'Install Geoteknik Software on the new computer using the installer from your purchase email.',
      'Open the software on the new machine and enter your license key in Help, then License Manager.',
      'Click Activate — the license will bind to the new computer immediately.',
    ],
  },

  // ── Geoteknik Software — Report Generation ─────────────────────────────
  {
    product: 'Report Engine',
    keywords: ['report', 'generate', 'generation', 'failed', 'error', 'soil', 'stability', 'won\'t generate', 'cannot create', 'report engine', 'stuck', 'stalled', 'not working'],
    issue_title: 'Geoteknik Software report generation failing or stalled',
    steps: [
      'Go to Tools in the menu bar, then Report Engine, then click Restart Engine.',
      'Wait 30 seconds for the engine to reinitialise — watch for the green status indicator in the bottom toolbar.',
      'Open your project and click Generate Report again from the Reports menu.',
      'If the same error appears, clear the application cache under Tools, then Options, then Clear Cache, and try again.',
      'Verify your project data is complete and all required input fields are filled in before generating.',
    ],
  },

  {
    product: 'Report Engine',
    keywords: ['report', 'pdf', 'export', 'blank', 'empty', 'missing data', 'corrupt', 'incomplete', 'pages missing', 'graph', 'chart'],
    issue_title: 'Generated report is blank or missing data sections',
    steps: [
      'Verify that all test layers and borehole data are marked as complete in the Project Navigator panel.',
      'Check the report template under Reports, then Template Settings — ensure all sections are enabled.',
      'Regenerate the report with a lower DPI setting first: go to Reports, then Page Setup, set to 150 DPI.',
      'If graphs are missing, right-click each chart in the project and choose Refresh Chart Data.',
      'Try exporting as a Word document instead of PDF to rule out a PDF renderer issue.',
    ],
  },

  // ── Geoteknik Software — Installation & Updates ────────────────────────
  {
    product: 'Geoteknik Software',
    keywords: ['install', 'installation', 'setup', 'cannot install', 'error installing', 'failed to install', 'admin', 'permissions', 'windows', 'blocked'],
    issue_title: 'Geoteknik Software installation failing on Windows',
    steps: [
      'Right-click the installer file and choose "Run as administrator" — this is required for all Geoteknik installations.',
      'Temporarily disable your antivirus software during installation, as it may block the license component.',
      'If you see a "Windows protected your PC" popup, click "More info" then "Run anyway" to proceed.',
      'Ensure you have at least 4 GB of free disk space on the installation drive.',
      'After installation completes, re-enable your antivirus and run Windows Update to ensure all dependencies are current.',
    ],
  },

  {
    product: 'Geoteknik Software',
    keywords: ['update', 'upgrade', 'version', 'new version', 'latest', 'check for updates', 'patch', 'outdated'],
    issue_title: 'How to update Geoteknik Software to the latest version',
    steps: [
      'Open Geoteknik Software and go to Help, then Check for Updates.',
      'If an update is available, click Download and Install — the installer will close and restart the application.',
      'If the update check fails, visit the Geoteknik customer portal at your registered email for direct download links.',
      'After updating, re-enter your license key if prompted — this is normal after major version upgrades.',
      'Check Help, then About to confirm the new version number matches the release notes.',
    ],
  },

  // ── Geoteknik Software — Project & Data Issues ─────────────────────────
  {
    product: 'Geoteknik Software',
    keywords: ['project', 'open', 'cannot open', 'file', 'corrupt', 'damaged', 'lost data', 'backup', 'recover', 'crash on open'],
    issue_title: 'Cannot open Geoteknik project file or project appears corrupt',
    steps: [
      'Try opening the file by going to File, then Open Recent — sometimes the direct file path becomes invalid.',
      'Check the auto-backup folder at C:\\Users\\YourName\\AppData\\Roaming\\Geoteknik\\Backups for a recent copy.',
      'If the project crashes on open, hold Shift while opening the file to load it in Safe Mode without plugins.',
      'Right-click the project file in Windows Explorer and check the file size — a file under 5 KB is likely empty or corrupt.',
      'If you have a backup, copy it to the project folder and rename it to the original filename.',
    ],
  },

  // ── Total Station — additional scenario ────────────────────────────────
  {
    product: 'total station',
    keywords: ['total station', 'battery', 'power', 'charge', 'charging', 'not turning on', 'dead', 'wont start', 'no power'],
    issue_title: 'Total station not powering on or battery not charging',
    steps: [
      'Remove the battery and inspect the contacts for corrosion or dirt — clean with a dry cloth.',
      'Insert the battery into the charger and check for the charging LED indicator.',
      'Allow at least 2 hours of charge before attempting to power on the instrument.',
      'If the instrument powers on only when connected to the charger, the battery needs replacement.',
      'Note the battery model number printed on the battery label for ordering a replacement.',
    ],
  },

  // ── GNSS — additional scenario ─────────────────────────────────────────
  {
    product: 'gps',
    keywords: ['gps', 'gnss', 'ntrip', 'correction', 'internet', 'data', 'mobile', 'sim', 'network', 'rtk corrections', 'caster'],
    issue_title: 'GNSS receiver not receiving NTRIP RTK corrections',
    steps: [
      'Verify mobile data is active on the SIM card inserted in the receiver.',
      'Check your NTRIP credentials in your survey software under Connection Settings.',
      'Confirm the NTRIP caster address and port number are correct — contact your corrections provider if unsure.',
      'Test internet connectivity by opening the web browser on your data collector and loading any webpage.',
      'Try a different NTRIP mount point — your provider may have multiple reference stations available.',
    ],
  },
];

async function seedDatabase() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  Geoteknik Demo KB Seeder — Fixed Version   ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  try {
    // Step 1: Test connection
    console.log('📡 Testing Supabase connection...');
    const { data: testData, error: testError } = await supabase
      .from('demo_kb')
      .select('count', { count: 'exact', head: true });

    if (testError) {
      console.error('❌ Connection failed:', testError.message);
      console.error('\n   Possible causes:');
      console.error('   1. demo_kb table does not exist');
      console.error('   2. SUPABASE_URL or SUPABASE_KEY is incorrect');
      console.error('   3. Network connection issue\n');
      process.exit(1);
    }
    console.log('✅ Connection successful\n');

    // Step 2: Clear existing data
    console.log('🗑️  Clearing existing demo_kb entries...');
    const { error: deleteError } = await supabase
      .from('demo_kb')
      .delete()
      .neq('id', 0); // delete all rows

    if (deleteError) {
      console.warn('⚠️  Could not clear existing entries (might be empty):', deleteError.message);
    } else {
      console.log('✅ Cleared existing entries\n');
    }

    // Step 3: Insert new data
    console.log(`📚 Seeding ${DEMO_KB.length} knowledge base entries...\n`);

    let successful = 0;
    let failed = 0;

    for (let i = 0; i < DEMO_KB.length; i++) {
      const entry = DEMO_KB[i];
      
      try {
        const { error: insertError } = await supabase
          .from('demo_kb')
          .insert({
            product: entry.product,
            keywords: entry.keywords,
            issue_title: entry.issue_title,
            steps: entry.steps,
          });

        if (insertError) {
          console.error(`  ❌ [${i + 1}/${DEMO_KB.length}] "${entry.issue_title}"`);
          console.error(`     Error: ${insertError.message}\n`);
          failed++;
        } else {
          console.log(`  ✅ [${i + 1}/${DEMO_KB.length}] [${entry.product}] ${entry.issue_title}`);
          successful++;
        }
      } catch (err) {
        console.error(`  ❌ [${i + 1}/${DEMO_KB.length}] Exception: ${err.message}`);
        failed++;
      }
    }

    // Step 4: Verify
    console.log(`\n${'═'.repeat(50)}`);
    const { count: finalCount, error: countError } = await supabase
      .from('demo_kb')
      .select('*', { count: 'exact', head: true });

    if (!countError && finalCount) {
      console.log(`✅ Final count in demo_kb: ${finalCount} records\n`);
    }

    // Summary
    console.log(`📊 Results:`);
    console.log(`   Successful: ${successful}/${DEMO_KB.length}`);
    console.log(`   Failed:     ${failed}/${DEMO_KB.length}`);
    console.log(`${'═'.repeat(50)}\n`);

    if (failed === 0) {
      console.log('✨ All entries seeded successfully!\n');
      console.log('🎯 Test it out:\n');
      console.log('   Hardware:');
      console.log('   • "My drone won\'t start"');
      console.log('   • "Compass calibration error"');
      console.log('   • "GPS can\'t find satellites"');
      console.log('   • "RTK not getting a fixed solution"');
      console.log('   • "Total station can\'t measure distance"');
      console.log('   • "Data collector keeps freezing"');
      console.log('   Software:');
      console.log('   • "I\'m getting a 404-L license error"');
      console.log('   • "Software won\'t activate"');
      console.log('   • "Report generation is failing"');
      console.log('   • "Can\'t open my project file"\n');
      process.exit(0);
    } else {
      console.log(`⚠️  ${failed} entries failed to seed\n`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n💥 Fatal error:', error.message);
    console.error('\nStack:', error.stack);
    process.exit(1);
  }
}

seedDatabase();
