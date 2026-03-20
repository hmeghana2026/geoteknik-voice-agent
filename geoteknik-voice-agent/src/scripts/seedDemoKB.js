/**
 * GEOTEKNIK DEMO KNOWLEDGE BASE SEEDER
 * =====================================
 * Seeds the demo_kb table with realistic problems + solutions
 * for a convincing POC demo happy path.
 *
 * Run: node src/scripts/seedDemoKB.js
 *
 * Covers:
 *   - Drones / UAVs
 *   - GNSS / GPS Receivers
 *   - Total Stations
 *   - Data Collectors / Controllers
 *   - Laser Scanners
 */

'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // Use service key for seeding
);

// ─────────────────────────────────────────────────────────────────────────────
// DEMO KB ENTRIES
// Each entry has:
//   product:     display name
//   keywords:    array of words caller might say (used for fuzzy matching)
//   issue_title: human-readable problem description
//   steps:       ordered array of resolution steps (read aloud one by one)
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_KB = [

  // ──────────────── DRONES ─────────────────────────────────────────────────

  {
    product: 'drone',
    keywords: ['drone', 'uav', 'quadcopter', 'fly', 'flight', 'not starting',
               'wont start', 'won\'t start', 'not turning on', 'dead', 'power'],
    issue_title: 'Drone will not power on',
    steps: [
      'Check that the battery is fully charged. The LED indicator on the battery should show at least two solid green lights. If it shows red or no lights, charge the battery for at least 90 minutes before continuing.',
      'Remove the battery and reinsert it firmly until you hear or feel a click. A loose battery connection is a common cause of power failure.',
      'Press and hold the power button for three full seconds — do not just tap it. The drone should beep and the arm lights should flash.',
      'If it still does not power on, try a different battery if you have one available, to rule out a faulty battery cell.',
      'If none of these steps work, the issue may be with the main power circuit. Please note your drone\'s serial number for our specialist team.',
    ],
  },

  {
    product: 'drone',
    keywords: ['drone', 'uav', 'compass', 'calibration', 'error', 'calibrate',
               'compass error', 'heading', 'direction', 'magnetic'],
    issue_title: 'Drone compass calibration error',
    steps: [
      'Move the drone at least 10 metres away from any metal structures, vehicles, or electronic equipment. Compass errors are almost always caused by nearby magnetic interference.',
      'Open the Geoteknik flight app and navigate to Settings, then Aircraft, then Compass. Tap "Start Calibration".',
      'Hold the drone horizontally and rotate it 360 degrees slowly in a full circle until the app confirms the first phase.',
      'Then tilt the drone nose-down to a vertical position and rotate it 360 degrees again for the second calibration phase.',
      'Wait for the green confirmation message in the app. If calibration fails twice, try a completely different location away from buildings.',
    ],
  },

  {
    product: 'drone',
    keywords: ['drone', 'uav', 'video', 'camera', 'feed', 'image', 'live',
               'black screen', 'no image', 'no video', 'fpv', 'screen'],
    issue_title: 'Drone camera feed not showing',
    steps: [
      'Check the cable connecting your remote controller to your phone or tablet. Disconnect and reconnect it firmly. A loose connection is the most common cause.',
      'Close the Geoteknik app completely — swipe it away from your recent apps — then reopen it. Do not just put it in the background.',
      'In the app, go to Camera Settings and verify the resolution is set to 1080p or lower. 4K can cause feed lag on some mobile devices.',
      'Power cycle the drone and remote controller together — turn both off, wait 10 seconds, then turn the controller on first, followed by the drone.',
      'If the camera gimbal makes a grinding noise on startup, the gimbal lock may still be installed. Check for the orange foam padding under the camera and remove it.',
    ],
  },

  {
    product: 'drone',
    keywords: ['drone', 'uav', 'battery', 'draining', 'fast', 'short flight',
               'flight time', 'low battery', 'percentage', 'drops quickly'],
    issue_title: 'Drone battery draining too fast',
    steps: [
      'Check the battery health in the app under Aircraft Settings, then Battery. If the battery capacity shows below 80 percent, the cells are degraded and the battery should be replaced.',
      'Verify you are flying in appropriate conditions. Cold weather below 10 degrees Celsius reduces battery capacity by up to 30 percent. Warm the battery to room temperature before flight.',
      'Check the drone arms and propellers for any damage or dirt. Bent propeller blades make the motors work harder and drain power faster.',
      'Reduce the payload if you are carrying additional equipment. Every 100 grams of extra weight reduces flight time by approximately two minutes.',
      'Perform a battery discharge cycle — fly until the app warns low battery, land safely, then fully charge overnight. This recalibrates the battery indicator.',
    ],
  },

  // ──────────────── GNSS / GPS ──────────────────────────────────────────────

  {
    product: 'gps',
    keywords: ['gps', 'gnss', 'receiver', 'satellite', 'signal', 'no fix',
               'no signal', 'cannot find', 'satellites', 'positioning', 'rtk'],
    issue_title: 'GNSS receiver cannot acquire satellite fix',
    steps: [
      'Move to an open area with a clear view of the sky. GNSS signals are blocked by buildings, trees, and overhead structures. You need at least 30 degrees of sky visibility in all directions.',
      'Wait 5 minutes after powering on before attempting any measurements. The receiver needs time to download satellite almanac data, especially after being stored for more than 7 days.',
      'Check the antenna connection. The TNC or SMA connector at the base of the antenna should be finger-tight. A loose antenna is a very common cause of poor signal.',
      'In the receiver settings, verify that all constellations are enabled — GPS, GLONASS, Galileo, and BeiDou. Having all four active dramatically improves fix acquisition speed.',
      'If you are attempting RTK and cannot get a fixed solution, check that your NTRIP credentials are correct in the data collector and that you have mobile data connectivity.',
    ],
  },

  {
    product: 'gps',
    keywords: ['gps', 'gnss', 'rtk', 'fixed', 'float', 'solution', 'accuracy',
               'centimeter', 'precision', 'base station', 'rover'],
    issue_title: 'RTK not achieving fixed solution, staying on float',
    steps: [
      'Confirm your base station is set up correctly over a known point and the base coordinates are entered accurately. An incorrect base position causes the rover to stay on float.',
      'Check the radio link signal strength — in the data collector, go to Device Status. You need at least 3 bars of radio signal. Move the rover closer to the base or raise the base antenna.',
      'Ensure both the base and rover are tracking the same satellite systems. Go to GNSS Settings on both units and confirm they match.',
      'A fixed solution typically requires 5 or more common satellites between base and rover. Check the satellite count display — if below 5, you may be in an area of heavy obstruction.',
      'Try restarting the RTK engine: in the data collector go to Survey, then Reset RTK. Wait 90 seconds for a fresh ambiguity resolution attempt.',
    ],
  },

  {
    product: 'gps',
    keywords: ['gps', 'gnss', 'bluetooth', 'connect', 'paired', 'pairing',
               'controller', 'data collector', 'cannot connect', 'connection'],
    issue_title: 'GNSS receiver not connecting to data collector via Bluetooth',
    steps: [
      'On the data collector, go to Settings and then Bluetooth. Check if the GNSS receiver appears in the paired devices list. If it does, tap it and select "Forget Device" to clear the old pairing.',
      'On the GNSS receiver, hold the Bluetooth button for 5 seconds until the Bluetooth LED flashes rapidly — this puts it into pairing mode.',
      'On the data collector, scan for new Bluetooth devices. The receiver should appear as "South" followed by its serial number. Tap it to pair.',
      'When prompted for a PIN code, enter 1234 — this is the default for all South GNSS receivers.',
      'Open your survey software and create a new connection profile. Select Bluetooth as the connection type and choose the receiver from the dropdown list.',
    ],
  },

  // ──────────────── TOTAL STATION ──────────────────────────────────────────

  {
    product: 'total station',
    keywords: ['total station', 'theodolite', 'prism', 'reflector', 'EDM',
               'distance', 'measurement', 'error', 'cannot measure', 'lock',
               'tracking', 'target', 'robotic'],
    issue_title: 'Total station cannot measure distance to prism',
    steps: [
      'Check that the prism is clean and facing directly toward the instrument. Even a slight angular offset of more than 5 degrees will cause the EDM to fail. Align the prism face squarely to the total station.',
      'On the instrument display, verify the correct prism constant is set. For a standard circular prism this is typically minus 30 millimetres. An incorrect prism constant prevents lock even when the beam appears aligned.',
      'Check the distance to your prism. Standard single-prism mode has a range of approximately 3 kilometres. If you are beyond this range, switch to triple-prism mode in the EDM settings.',
      'Clean the EDM port on the total station with a dry lens cloth. Any moisture or dust on the emitter window significantly degrades the signal.',
      'Switch the instrument to reflectorless EDM mode temporarily and aim at a flat white wall nearby. If you get a reading, the EDM is working and the issue is with the prism setup.',
    ],
  },

  {
    product: 'total station',
    keywords: ['total station', 'level', 'leveling', 'bubble', 'tilt',
               'not level', 'tilt error', 'compensator', 'cant level'],
    issue_title: 'Total station showing tilt or levelling error',
    steps: [
      'Check that the tripod legs are firmly planted on stable ground. Push each leg down firmly and verify the tripod head is approximately horizontal before mounting the instrument.',
      'Loosen the tribrach screws and re-centre the circular bubble (the large round bubble) first, before touching the plate bubble. Use the three foot screws and work two at a time.',
      'Once the circular bubble is centred, use the electronic level display to fine-tune. Adjust the foot screws while watching the on-screen tilt indicator, aiming for less than 30 arc-seconds of tilt.',
      'If the compensator error persists after levelling, go to Menu then Instrument Settings then Compensator, and run the compensator calibration routine.',
      'If the instrument reports a "Tilt Over Range" error even on flat ground, the compensator sensor may need recalibration by a service centre. Note the error code shown on the display.',
    ],
  },

  // ──────────────── DATA COLLECTOR / CONTROLLER ────────────────────────────

  {
    product: 'data collector',
    keywords: ['data collector', 'controller', 'handheld', 'field computer',
               'software', 'crash', 'freezing', 'frozen', 'slow', 'restart',
               'not responding'],
    issue_title: 'Data collector software freezing or crashing',
    steps: [
      'Perform a soft reset: hold the power button for 10 seconds until the device restarts. This clears any memory leak without losing your field data.',
      'Check available storage space — go to Settings then Storage. If free space is below 500 megabytes, delete old project backups or transfer them to an SD card before continuing fieldwork.',
      'Close all background applications. On Windows Mobile, press and hold the X button on each open app. On Android, use the recent apps button to close everything.',
      'If the survey software crashes on a specific project file, the file may be corrupted. Try opening a different project to confirm. Your data can usually be recovered from the automatic backup in the project\'s backup folder.',
      'Update the survey software to the latest version — go to Help then Check for Updates. Known crash bugs are often fixed in recent releases.',
    ],
  },

  {
    product: 'data collector',
    keywords: ['data collector', 'controller', 'sync', 'transfer', 'upload',
               'download', 'file', 'import', 'export', 'USB', 'office'],
    issue_title: 'Cannot transfer files from data collector to office software',
    steps: [
      'Use the USB cable that came with the data collector — third-party cables often only charge and do not transfer data. Connect directly to a USB port on the PC, not a USB hub.',
      'On the PC, check if Windows recognises the device. Open File Explorer and look for the data collector under "This PC" or "Portable Devices". If it does not appear, try installing the ActiveSync or Windows Mobile Device Centre driver from the Geoteknik support page.',
      'On the data collector, when the USB connection prompt appears select "File Transfer" or "MTP" mode, not charging mode.',
      'If you prefer wireless transfer, enable WiFi hotspot on your phone, connect both the data collector and PC to it, and use the built-in WiFi transfer feature in the survey software.',
      'As a reliable fallback, export your project to the SD card slot on the data collector, remove the card, and read it directly with a card reader on the PC.',
    ],
  },

  // ──────────────── LASER SCANNER ──────────────────────────────────────────

  {
    product: 'laser scanner',
    keywords: ['laser', 'scanner', 'scan', 'point cloud', 'lidar',
               'not scanning', 'scan error', 'registration', 'targets'],
    issue_title: 'Laser scanner not completing scan or producing errors',
    steps: [
      'Check that the scanner is level. Most scanners will refuse to start a scan if the tilt exceeds 5 degrees. Use the on-screen bull\'s eye level indicator and adjust the tribrach until the bubble is centred.',
      'Ensure the lens is clean. Use the microfibre cloth provided in the case and wipe the scanner window gently. Dust or fingerprints cause missed points and scan errors.',
      'Verify that the target distance is within the specified range for your scan resolution setting. At high resolution, maximum range is typically 50 metres for indoor scanning.',
      'If you are seeing "Mirror Error" on the display, the rotating mirror inside the scanner may be obstructed. Power off, gently tilt the scanner to check for any debris in the top aperture, and restart.',
      'For registration errors in the office software, ensure your scan targets were placed within the overlap area between scans and that you have at least three targets visible in each overlapping scan pair.',
    ],
  },

];

// ─────────────────────────────────────────────────────────────────────────────
// SEED FUNCTION
// ─────────────────────────────────────────────────────────────────────────────
async function seedDemoKB() {
  console.log('\n🌱 Geoteknik Demo Knowledge Base Seeder');
  console.log('=========================================\n');

  // Clear existing demo KB
  console.log('Clearing existing demo_kb entries...');
  const { error: clearErr } = await supabase
    .from('demo_kb')
    .delete()
    .neq('id', 0);   // delete all rows

  if (clearErr) {
    console.error('❌ Could not clear demo_kb:', clearErr.message);
    console.log('   (This is OK if the table is new — continuing)\n');
  } else {
    console.log('✓ Cleared existing entries\n');
  }

  // Insert all entries
  let success = 0;
  let failed  = 0;

  for (const entry of DEMO_KB) {
    const { error } = await supabase
      .from('demo_kb')
      .insert({
        product    : entry.product,
        keywords   : entry.keywords,
        issue_title: entry.issue_title,
        steps      : JSON.stringify(entry.steps),
      });

    if (error) {
      console.error(`  ❌ Failed: "${entry.issue_title}" — ${error.message}`);
      failed++;
    } else {
      console.log(`  ✓ Seeded: [${entry.product}] ${entry.issue_title}`);
      success++;
    }
  }

  console.log(`\n=========================================`);
  console.log(`✅ Done: ${success} entries seeded, ${failed} failed`);
  console.log(`\nDemo KB is ready. Test it by calling about:`);
  console.log(`  • "My drone won't start"`);
  console.log(`  • "Compass calibration error"`);
  console.log(`  • "GPS can't find satellites"`);
  console.log(`  • "RTK not getting a fixed solution"`);
  console.log(`  • "Total station can't measure distance"`);
  console.log(`  • "Data collector keeps freezing"\n`);
}

seedDemoKB().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});