const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');

const SERVER_URL = 'http://localhost:4000';
const RESULT_PATH = path.join(__dirname, 'experiment_results.json');
const HISTORY_PATH = path.join(__dirname, 'backend', 'data', 'history.json');

// Define the 25 run configurations based on the PDF guide
const runs = [
  // ==================== SKENARIO A.1 ====================
  { id: 'A.1.1', type: 'A1', name: 'Skenario A.1 - Pengaruh Delay (1 Follower)', followers: 1, delay: 10, plr: 0, bw: 20 },
  { id: 'A.1.2', type: 'A1', name: 'Skenario A.1 - Pengaruh Delay (2 Followers)', followers: 2, delay: 10, plr: 0, bw: 20 },
  { id: 'A.1.3', type: 'A1', name: 'Skenario A.1 - Pengaruh Delay (3 Followers)', followers: 3, delay: 10, plr: 0, bw: 20 },
  { id: 'A.1.4', type: 'A1', name: 'Skenario A.1 - Pengaruh Delay (3 Followers, 5ms)', followers: 3, delay: 5,  plr: 0, bw: 20 },
  { id: 'A.1.5', type: 'A1', name: 'Skenario A.1 - Pengaruh Delay (3 Followers, 20ms)', followers: 3, delay: 20, plr: 0, bw: 20 },
  { id: 'A.1.6', type: 'A1', name: 'Skenario A.1 - Pengaruh Delay (3 Followers, 50ms)', followers: 3, delay: 50, plr: 0, bw: 20 },

  // ==================== SKENARIO A.2 ====================
  { id: 'A.2.1', type: 'A2', name: 'Skenario A.2 - Threshold PLR (0%)', followers: 3, delay: 2,  plr: 0,  bw: 20 },
  { id: 'A.2.2', type: 'A2', name: 'Skenario A.2 - Threshold PLR (5%)', followers: 3, delay: 10, plr: 5,  bw: 20 },
  { id: 'A.2.3', type: 'A2', name: 'Skenario A.2 - Threshold PLR (10%)', followers: 3, delay: 20, plr: 10, bw: 20 },
  { id: 'A.2.4', type: 'A2', name: 'Skenario A.2 - Threshold PLR (14%)', followers: 3, delay: 25, plr: 14, bw: 20 },
  { id: 'A.2.5', type: 'A2', name: 'Skenario A.2 - Threshold PLR (15%)', followers: 3, delay: 25, plr: 15, bw: 20 },
  { id: 'A.2.6', type: 'A2', name: 'Skenario A.2 - Threshold PLR (18%)', followers: 3, delay: 40, plr: 18, bw: 20 },
  { id: 'A.2.7', type: 'A2', name: 'Skenario A.2 - Threshold PLR (5% Delay 50ms)', followers: 3, delay: 50, plr: 5,  bw: 20 },

  // ==================== SKENARIO A.3 ====================
  { id: 'A.3.1', type: 'A3', name: 'Skenario A.3 - Bandwidth 5 MHz (1 Follower)', followers: 1, delay: 2,  plr: 0,  bw: 5 },
  { id: 'A.3.2', type: 'A3', name: 'Skenario A.3 - Bandwidth 5 MHz (3 Followers)', followers: 3, delay: 2,  plr: 0,  bw: 5 },
  { id: 'A.3.3', type: 'A3', name: 'Skenario A.3 - Bandwidth 10 MHz (3 Followers)', followers: 3, delay: 2,  plr: 0,  bw: 10 },
  { id: 'A.3.4', type: 'A3', name: 'Skenario A.3 - Bandwidth 20 MHz (3 Followers)', followers: 3, delay: 2,  plr: 0,  bw: 20 },
  { id: 'A.3.5', type: 'A3', name: 'Skenario A.3 - Bandwidth 50 MHz (3 Followers)', followers: 3, delay: 2,  plr: 0,  bw: 50 },
  { id: 'A.3.6', type: 'A3', name: 'Skenario A.3 - Bandwidth 100 MHz (3 Followers)', followers: 3, delay: 2,  plr: 0,  bw: 100 },

  // ==================== SKENARIO B.1 ====================
  { id: 'B.1.1', type: 'B1', name: 'Skenario B.1 - Join-in-Middle (Ideal)', followers: 2, delay: 2,  plr: 0,  bw: 20, action: 'join' },
  { id: 'B.1.2', type: 'B1', name: 'Skenario B.1 - Depart Middle (Ideal)', followers: 3, delay: 2,  plr: 0,  bw: 20, action: 'depart' },
  { id: 'B.1.3', type: 'B1', name: 'Skenario B.1 - Join 2 vehicles (Ideal)', followers: 1, delay: 2,  plr: 0,  bw: 20, action: 'join2' },

  // ==================== SKENARIO B.2 ====================
  { id: 'B.2.1', type: 'B2', name: 'Skenario B.2 - Join-in-Middle (Buruk)', followers: 2, delay: 20, plr: 10, bw: 20, action: 'join' },
  { id: 'B.2.2', type: 'B2', name: 'Skenario B.2 - Depart Middle (Buruk)', followers: 3, delay: 20, plr: 10, bw: 20, action: 'depart' },
  { id: 'B.2.3', type: 'B2', name: 'Skenario B.2 - Join-in-Middle (Kritis)', followers: 2, delay: 25, plr: 14, bw: 20, action: 'join' }
];

async function runSession(run, rep) {
  const sessionName = `Skenario_${run.id}_Rep_${rep}`;
  console.log(`\n==================================================`);
  console.log(`[START] Running: ${sessionName} (${run.name})`);
  console.log(`Parameters: Followers: ${run.followers}, Delay: ${run.delay}ms, PLR: ${run.plr}%, BW: ${run.bw}MHz`);
  console.log(`==================================================`);

  return new Promise((resolve) => {
    const socket = io(SERVER_URL, { forceNew: true });
    let isFinished = false;
    let hasManeuvered = false;
    let collisionOccurred = false;
    let latestState = null;
    let startTimeStamp = Date.now();

    const finish = async (statusOverride = null) => {
      if (isFinished) return;
      isFinished = true;
      socket.emit('sim:stop');
    };

    socket.on('connect', () => {
      console.log('Connected to simulation server.');
      // 1. Set parameters first
      socket.emit('sim:updateParams', {
        targetSpeed: 22,
        timeHeadway: 1.2,
        standstillDistance: 8,
        latencyMs: run.delay,
        packetLossPercent: run.plr,
        channelBandwidthHz: run.bw * 1_000_000,
        v2vTopology: 'Hybrid',
        dynamicPathLoss: false
      });

      // 2. Start simulation with requested configuration (always 2 platoons for lane change/transfers)
      socket.emit('sim:start', {
        platoonCount: 2,
        followerCount: run.followers
      });

      // 3. Set speed to 4x multiplier
      socket.emit('sim:setSpeed', { speed: 4 });
    });

    socket.on('sim:state', (state) => {
      if (isFinished) return;
      latestState = state;

      const elapsed = state.elapsedSeconds || 0;
      process.stdout.write(`Simulated Time: ${elapsed.toFixed(1)}s (Speed: ${state.simSpeed}x) | Spacing Error: ${state.telemetry.spacingError.toFixed(2)}m\r`);

      // Trigger Maneuver at simulated t = 15s for Scenario B
      if (run.action && elapsed >= 15 && !hasManeuvered) {
        hasManeuvered = true;
        console.log(`\n[MANEUVER] Simulated t = ${elapsed.toFixed(1)}s: Triggering '${run.action}'...`);
        if (run.action === 'join') {
          // Join a vehicle from lane 1 (platoon B) to lane 0 (platoon A)
          socket.emit('sim:swapVehicles', { idA: 'b_f1', idB: 'f1' });
        } else if (run.action === 'depart') {
          // Depart middle vehicle of platoon A (f2) into lane 1
          socket.emit('sim:switchLane', { vehicleId: 'f2', targetLane: 1 });
        } else if (run.action === 'join2') {
          // Join both b_f1 and b_f2 to platoon A
          socket.emit('sim:swapVehicles', { idA: 'b_f1', idB: 'f1' });
          setTimeout(() => {
            socket.emit('sim:swapVehicles', { idA: 'b_f2', idB: 'f1' });
          }, 200);
        }
      }

      // Check end duration (Scenario B: 60s, Scenario A: 45s)
      const targetDuration = run.action ? 60.0 : 45.0;
      if (elapsed >= targetDuration) {
        console.log(`\n[DURATION REACHED] Simulated time limit met (${targetDuration}s). Stopping...`);
        finish();
      }
    });

    socket.on('sim:collision', (collision) => {
      if (isFinished) return;
      collisionOccurred = true;
      console.log(`\n[COLLISION DETECTED] between ${collision.between.join(' and ')} at gap ${collision.gapMeters}m!`);
      finish('COLLIDED');
    });

    socket.on('sim:saved', async (record) => {
      // 4. Rename record in server history
      try {
        const response = await fetch(`${SERVER_URL}/api/sessions/${record.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: sessionName })
        });
        if (response.ok) {
          console.log(`Saved and renamed session: ${sessionName}`);
        }
      } catch (err) {
        console.error('Error renaming session:', err.message);
      }

      // 5. Calculate stabilization time for Scenario B
      let stabilizationTime = null;
      if (run.action && record.series) {
        // Find series points after t = 15s
        const afterManeuver = record.series.filter(s => s.t >= 15.0);
        
        // Find if there is a point where spacingError becomes high (> 0.2m)
        const peakIdx = afterManeuver.findIndex(s => s.spacingError > 0.2);
        if (peakIdx !== -1) {
          // From the peak, find the first point where spacing error returns and stays < 0.1m
          const recovery = afterManeuver.slice(peakIdx).find((s, idx, arr) => {
            // Check if it stays below 0.1m for subsequent steps (e.g. 5 samples = 1 second)
            return s.spacingError < 0.1 && arr.slice(idx, idx + 5).every(x => x.spacingError < 0.1);
          });
          if (recovery) {
            stabilizationTime = Number((recovery.t - 15.0).toFixed(1));
          }
        }
        
        // If not found but error is small at the end, just get when it first went < 0.1m
        if (stabilizationTime === null) {
          const finalStable = afterManeuver.reverse().find(s => s.spacingError >= 0.1);
          if (finalStable) {
            stabilizationTime = Number((afterManeuver[0].t - finalStable.t).toFixed(1));
            if (stabilizationTime <= 0) stabilizationTime = null;
          } else {
            stabilizationTime = 0.0; // Already stable
          }
        }
      }

      socket.disconnect();

      resolve({
        runId: run.id,
        type: run.type,
        rep,
        sessionName,
        status: collisionOccurred ? 'COLLIDED' : (latestState ? latestState.telemetry.status : 'Stable'),
        avgDelayMs: record.avgDelayMs,
        avgSpacingError: record.avgSpacingError,
        maxSpacingError: record.maxSpacingError,
        avgStringStability: record.avgStringStability,
        packetLossPercent: record.packetLossPercent,
        collisionCount: record.collisionCount,
        avgUpdateHz: record.avgUpdateHz,
        accFallbackPercent: record.accFallbackPercent,
        stabilizationTime: stabilizationTime,
        controlMode: latestState ? latestState.telemetry.controlMode : 'CACC'
      });
    });

    socket.on('disconnect', () => {
      if (!isFinished) {
        console.log('\nDisconnected before saving. Resolving...');
        resolve(null);
      }
    });

    socket.on('connect_error', (err) => {
      console.error('\nConnect error:', err.message);
      socket.disconnect();
      resolve(null);
    });
  });
}

async function startExperiments() {
  const allResults = [];

  for (const run of runs) {
    for (let rep = 1; rep <= 3; rep++) {
      const res = await runSession(run, rep);
      if (res) {
        allResults.push(res);
        fs.writeFileSync(RESULT_PATH, JSON.stringify(allResults, null, 2));
      }
      // Brief pause between sessions
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log('\n\n==================================================');
  console.log('ALL EXPERIMENTS COMPLETED!');
  console.log(`Results saved to: ${RESULT_PATH}`);
  console.log('==================================================');

  generateTables(allResults);
}

function generateTables(results) {
  // Aggregate results by runId (average of the 3 repetitions)
  const aggregated = {};
  for (const r of results) {
    if (!aggregated[r.runId]) {
      aggregated[r.runId] = {
        runId: r.runId,
        type: r.type,
        count: 0,
        status: 'Stable',
        avgDelayMs: 0,
        avgSpacingError: 0,
        maxSpacingError: 0,
        avgStringStability: 0,
        packetLossPercent: 0,
        collisionCount: 0,
        avgUpdateHz: 0,
        accFallbackPercent: 0,
        stabilizationTime: 0,
        stabCount: 0,
        controlModes: []
      };
    }
    const agg = aggregated[r.runId];
    agg.count += 1;
    if (r.status === 'Unstable' || r.status === 'COLLIDED') agg.status = r.status;
    agg.avgDelayMs += r.avgDelayMs;
    agg.avgSpacingError += r.avgSpacingError;
    agg.maxSpacingError += r.maxSpacingError;
    agg.avgStringStability += r.avgStringStability;
    agg.packetLossPercent += r.packetLossPercent;
    agg.collisionCount += r.collisionCount;
    agg.avgUpdateHz += r.avgUpdateHz;
    agg.accFallbackPercent += r.accFallbackPercent;
    agg.controlModes.push(r.controlMode);
    
    if (r.stabilizationTime !== null) {
      agg.stabilizationTime += r.stabilizationTime;
      agg.stabCount += 1;
    }
  }

  // Calculate averages
  for (const runId in aggregated) {
    const agg = aggregated[runId];
    agg.avgDelayMs = Number((agg.avgDelayMs / agg.count).toFixed(2));
    agg.avgSpacingError = Number((agg.avgSpacingError / agg.count).toFixed(3));
    agg.maxSpacingError = Number((agg.maxSpacingError / agg.count).toFixed(3));
    agg.avgStringStability = Number((agg.avgStringStability / agg.count).toFixed(3));
    agg.packetLossPercent = Number((agg.packetLossPercent / agg.count).toFixed(2));
    agg.collisionCount = Number((agg.collisionCount / agg.count).toFixed(1));
    agg.avgUpdateHz = Number((agg.avgUpdateHz / agg.count).toFixed(1));
    agg.accFallbackPercent = Number((agg.accFallbackPercent / agg.count).toFixed(1));
    agg.stabilizationTime = agg.stabCount > 0 ? Number((agg.stabilizationTime / agg.stabCount).toFixed(1)) : null;
    
    // Determine major mode
    const accCount = agg.controlModes.filter(m => m === 'ACC').length;
    agg.controlMode = accCount >= 2 ? 'ACC' : 'CACC';
  }

  // Print tables
  console.log('\n--- TEMPLATE LAPORAN DATA PENGUJIAN ---');
  
  console.log('\n8.1 Lembar Data Skenario A.1 (Delay & Follower)');
  console.log('| Run | Follower | Delay (ms) | E2E Delay Avg (ms) | Spacing Error Avg (m) | Status |');
  console.log('|---|---|---|---|---|---|');
  const a1 = ['A.1.1', 'A.1.2', 'A.1.3', 'A.1.4', 'A.1.5', 'A.1.6'];
  a1.forEach(id => {
    const agg = aggregated[id];
    const r = runs.find(x => x.id === id);
    if (agg) {
      console.log(`| ${id} | ${r.followers} | ${r.delay} | ${agg.avgDelayMs} ms | ${agg.avgSpacingError} m | ${agg.status} |`);
    }
  });

  console.log('\n8.2 Lembar Data Skenario A.2 (Packet Loss Rate)');
  console.log('| Run | Delay (ms) | PLR (%) | Spacing Err Avg (m) | Status Kestabilan | Mode Kontrol |');
  console.log('|---|---|---|---|---|---|');
  const a2 = ['A.2.1', 'A.2.2', 'A.2.3', 'A.2.4', 'A.2.5', 'A.2.6', 'A.2.7'];
  a2.forEach(id => {
    const agg = aggregated[id];
    const r = runs.find(x => x.id === id);
    if (agg) {
      console.log(`| ${id} | ${r.delay} | ${r.plr}% | ${agg.avgSpacingError} m | ${agg.status} | ${agg.controlMode} |`);
    }
  });

  console.log('\n8.3 Lembar Data Skenario A.3 (Channel Bandwidth 5G NR)');
  console.log('| Run | Follower | BW (MHz) | NRB (teoritis) | Occupancy (%) | Status Komun. |');
  console.log('|---|---|---|---|---|---|');
  const a3 = ['A.3.1', 'A.3.2', 'A.3.3', 'A.3.4', 'A.3.5', 'A.3.6'];
  const nrbMap = { 5: '25 RB', 10: '52 RB', 20: '106 RB', 50: '270 RB', 100: '273 RB' };
  a3.forEach(id => {
    const agg = aggregated[id];
    const r = runs.find(x => x.id === id);
    if (agg) {
      console.log(`| ${id} | ${r.followers} | ${r.bw} | ${nrbMap[r.bw] || 'N/A'} | ${agg.packetLossPercent}% | ${agg.status === 'Stable' ? 'Good' : 'Degraded'} |`);
    }
  });

  console.log('\n8.4 Lembar Data Skenario B (Pertukaran Platoon)');
  console.log('| Run | Tindakan | Jaringan | Waktu Stabil (s) | Catatan / Observasi |');
  console.log('|---|---|---|---|---|');
  const b = ['B.1.1', 'B.1.2', 'B.1.3', 'B.2.1', 'B.2.2', 'B.2.3'];
  b.forEach(id => {
    const agg = aggregated[id];
    const r = runs.find(x => x.id === id);
    if (agg) {
      const net = r.type === 'B1' ? 'Ideal' : (r.delay === 25 ? 'Kritis' : 'Terdegradasi');
      const stabTime = agg.stabilizationTime !== null ? `${agg.stabilizationTime} s` : 'Tidak pulih';
      console.log(`| ${id} | ${r.action} | ${net} | ${stabTime} | Mode Kontrol: ${agg.controlMode}, Spacing Err: ${agg.avgSpacingError}m |`);
    }
  });
}

startExperiments();
