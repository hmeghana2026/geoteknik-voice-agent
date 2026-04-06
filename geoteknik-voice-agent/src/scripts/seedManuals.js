#!/usr/bin/env node
/**
 * seedManuals.js
 * ==============
 * Seeds the `manuals` table with structured product knowledge as text chunks,
 * then generates OpenAI embeddings for each chunk so vector search works.
 *
 * Use this when you don't have the actual PDF/DOC manuals on disk — it gives
 * the vector search enough content to find relevant results.
 *
 * Usage:
 *   node src/scripts/seedManuals.js
 *
 * Requirements:
 *   .env: SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY
 *   Supabase: manuals table + search_manuals RPC (run database/supabase-migration.sql first)
 */

'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

if (!process.env.SUPABASE_URL || !process.env.OPENAI_API_KEY) {
  console.error('❌ SUPABASE_URL and OPENAI_API_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// Manual content — add your product knowledge here as plain paragraphs.
// Each entry becomes one searchable chunk in the vector index.
// ─────────────────────────────────────────────────────────────────────────────
const MANUAL_CHUNKS = [
  // ── Geoteknik Software — License ───────────────────────────────────────
  {
    product_name: 'Geoteknik Software',
    content: `Geoteknik Software License Activation Guide.
To activate your license: open the software, go to Help > License Manager, click Activate, and enter your license key exactly as provided in your purchase confirmation email.
The software must be connected to the internet during activation so the Geoteknik license server can validate your key.
If you receive a 404-L error it means the license key was not recognised. Common causes: (1) typo in the key — use copy-paste, (2) the key has already been used on the maximum number of machines, (3) the license has expired.
To transfer the license to a new computer: on the old machine open Help > License Manager and click Deactivate. Then install the software on the new machine and activate using the same key.`,
  },
  {
    product_name: 'Geoteknik Software',
    content: `Geoteknik Software Installation Troubleshooting.
Always run the installer as Administrator (right-click > Run as administrator) — the license module requires elevated privileges to write to the system registry.
Windows SmartScreen may display a warning for unsigned installers. Click "More info" then "Run anyway" to proceed.
Antivirus software can block the license component during installation. Temporarily disable real-time protection, complete the installation, then re-enable it.
Minimum requirements: Windows 10 64-bit, 8 GB RAM, 4 GB free disk space, .NET Framework 4.8.
If installation fails with error code 1603 it is a permissions issue — ensure your user account has full control of the Program Files directory.`,
  },
  {
    product_name: 'Geoteknik Software',
    content: `Geoteknik Software Report Generation.
The Report Engine processes geotechnical data and produces PDF reports including soil stability analysis, borehole logs, and foundation design summaries.
If report generation fails or stalls: go to Tools > Report Engine > Restart Engine. Wait 30 seconds for reinitialisation (green status indicator appears in the toolbar).
If the generated report is blank or missing sections: verify all project layers are marked complete in the Project Navigator. Check the report template under Reports > Template Settings.
Clear the application cache under Tools > Options > Clear Cache if graphs or charts do not render correctly.
For very large projects (over 500 boreholes) increase memory allocation under Tools > Options > Performance > Maximum Memory.`,
  },
  {
    product_name: 'Geoteknik Software',
    content: `Geoteknik Software Project File Recovery.
Project files are saved in .gtk format. Auto-backups are stored at C:\\Users\\<username>\\AppData\\Roaming\\Geoteknik\\Backups with a timestamp in the filename.
If a project file appears corrupt: try opening it while holding the Shift key to load in Safe Mode (plugins disabled).
If the software crashes on opening a specific project: check the log file at C:\\ProgramData\\Geoteknik\\Logs\\error.log for the root cause.
Recovering a backup: navigate to the Backups folder, copy the most recent .gtk file, rename it to the original project name, and place it in your project folder.
Always keep project files on a local drive — network drives can cause file locking issues that corrupt saves.`,
  },

  // ── South GNSS GPS Receiver ─────────────────────────────────────────────
  {
    product_name: 'South GNSS GPS Receiver',
    content: `South GNSS GPS Receiver — Satellite Acquisition.
The receiver tracks GPS, GLONASS, Galileo, and BeiDou constellations simultaneously.
For initial satellite acquisition: move to an open area with at least 30 degrees of unobstructed sky. Power on the receiver and wait 5 minutes for it to download almanac data.
Verify the antenna connection is secure (finger-tight SMA connector). A loose connection reduces signal strength significantly.
Enable all four constellations in the receiver settings: Menu > Settings > Satellite Systems.
In the South Survey app, the satellite count and signal bars are shown on the main dashboard. You need at least 5 satellites for a standard fix and 8 for reliable RTK.`,
  },
  {
    product_name: 'South GNSS GPS Receiver',
    content: `South GNSS GPS Receiver — RTK (Real-Time Kinematic) Setup.
RTK provides centimetre-level accuracy by comparing your rover position against a base station sending correction data.
Base station setup: set the base over a known control point, enter the precise coordinates, and configure it to broadcast corrections over radio or internet (NTRIP).
Rover setup: connect to the base corrections in your survey software under Connection > Base Correction. Select your correction source (radio or NTRIP).
For NTRIP: enter the caster address, port, mount point, username, and password provided by your corrections service. The receiver must have an active SIM with mobile data.
RTK float means corrections are received but not yet converged — wait 1 to 3 minutes. RTK fixed means centimetre accuracy is achieved. If stuck on float: check radio signal strength (need 3+ bars) and ensure base and rover track common satellites.`,
  },
  {
    product_name: 'South GNSS GPS Receiver',
    content: `South GNSS GPS Receiver — Bluetooth Pairing with Data Collector.
To pair: on the data collector go to Settings > Bluetooth, select the GNSS receiver from the discovered devices list.
Default PIN code for all South GNSS receivers is 1234.
If the receiver does not appear in the scan: hold the Bluetooth button on the receiver for 5 seconds until the LED flashes rapidly (pairing mode).
If a previous pairing exists but connection fails: on the data collector forget the device and re-pair from scratch.
Once paired, open your survey software (e.g. Survey Master), go to Configuration > Device > GNSS Receiver and create a new connection profile pointing to the paired Bluetooth port.`,
  },

  // ── Drone / UAV ─────────────────────────────────────────────────────────
  {
    product_name: 'Geoteknik UAV / Drone',
    content: `Geoteknik UAV Drone — Pre-flight and Power Issues.
Battery: use only manufacturer-approved batteries. Insert firmly until you hear the locking click. LED indicators: 4 green = full, 3 = 75%, 2 = 50%, 1 flashing = critical.
If the drone will not power on: (1) check battery LEDs, (2) remove and reinsert battery, (3) hold power button 3 seconds — you should hear a startup beep.
Cold weather (below 5°C) significantly reduces battery capacity. Warm batteries to room temperature before flying.
If the app shows firmware mismatch on startup: connect to Wi-Fi and update firmware through the Geoteknik Flight app Settings > Firmware Update before flying.
Never fly with a battery below 20% — the drone will enter automatic landing mode at 15%.`,
  },
  {
    product_name: 'Geoteknik UAV / Drone',
    content: `Geoteknik UAV Drone — Compass Calibration.
Compass calibration is required: after firmware updates, when operating in a new geographic region (over 50 km from last calibration), or when the app shows a compass error warning.
Calibration procedure: (1) Move at least 10 metres from metal structures, vehicles, and power lines. (2) Open app > Aircraft > Compass > Start Calibration. (3) Hold drone horizontally and rotate 360 degrees slowly. (4) Tilt drone nose-down and rotate 360 degrees again. (5) Wait for green confirmation.
If calibration fails repeatedly: check for nearby magnetic interference sources. Metal buildings, underground pipes, and reinforced concrete slabs all affect compass readings.
Do not calibrate near airports or in areas with high electromagnetic interference.`,
  },

  // ── Total Station ───────────────────────────────────────────────────────
  {
    product_name: 'Total Station',
    content: `Total Station — Distance Measurement (EDM) Troubleshooting.
The EDM (Electronic Distance Measurement) uses an infrared or laser beam to measure distance to a prism or reflectorless surface.
If the instrument cannot measure: (1) ensure the prism is clean and facing the instrument directly, (2) verify the correct prism constant is set (standard mini prism = -17.5 mm, standard prism = -30 mm), (3) clean the EDM port with a dry lens cloth.
Maximum range: standard single prism approximately 3 km, mini prism 1.5 km. Range reduces in haze, rain, or direct sunlight.
Reflectorless mode works on white or light-coloured surfaces up to 500 metres. Avoid dark, wet, or transparent surfaces.
If prism lock (auto-tracking) loses the target: stop moving, wait 3 seconds, then press the Search button.`,
  },
  {
    product_name: 'Total Station',
    content: `Total Station — Levelling and Compensator.
The total station must be level before taking measurements. The electronic compensator corrects for small tilts (±3 arcminutes) automatically.
Levelling procedure: (1) set up tripod on firm, level ground, (2) centre circular bubble using the three foot screws, (3) fine-tune using the electronic level display (cross-hair bubble on screen).
If the compensator error (tilt error) message appears: the instrument is tilted beyond the compensator range. Re-level manually.
If the electronic level shows unstable readings: the compensator may need calibration. Go to Menu > Instrument Settings > Compensator > Calibrate. Place the instrument on a stable surface in a windless environment.
Tripod legs should be fully extended and tightened — loose legs cause vibration and unstable readings.`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────

async function embed(text) {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return res.data[0].embedding;
}

async function seedManuals() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  Geoteknik Manuals Vector Seeder             ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Clear existing seeded content
  console.log('🗑️  Clearing existing manual chunks...');
  const { error: delErr } = await supabase
    .from('manuals')
    .delete()
    .neq('id', 0);
  if (delErr) console.warn('  ⚠️  Could not clear:', delErr.message);
  else console.log('  ✅ Cleared\n');

  console.log(`📚 Embedding and uploading ${MANUAL_CHUNKS.length} chunks...\n`);

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < MANUAL_CHUNKS.length; i++) {
    const chunk = MANUAL_CHUNKS[i];
    try {
      process.stdout.write(`  [${i + 1}/${MANUAL_CHUNKS.length}] ${chunk.product_name.padEnd(30)} embedding... `);
      const embedding = await embed(chunk.content);

      const { error } = await supabase
        .from('manuals')
        .insert({ product_name: chunk.product_name, content: chunk.content, embedding });

      if (error) {
        console.log(`❌ ${error.message}`);
        fail++;
      } else {
        console.log('✅');
        ok++;
      }

      // Throttle to stay within OpenAI rate limits
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.log(`❌ ${err.message}`);
      fail++;
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📊 Results: ${ok} succeeded, ${fail} failed`);
  console.log(`${'═'.repeat(50)}\n`);

  if (fail === 0) {
    console.log('✨ Vector index ready! The agent will now use semantic search on manuals.\n');
  } else {
    console.log(`⚠️  ${fail} chunks failed — check OPENAI_API_KEY and manuals table schema.\n`);
    process.exit(1);
  }
}

seedManuals().catch(err => {
  console.error('\n💥 Fatal:', err.message);
  process.exit(1);
});
