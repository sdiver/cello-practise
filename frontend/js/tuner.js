// YIN 算法音高检测器
class YINDetector {
    constructor(sampleRate) {
        this.sampleRate = sampleRate;
        this.threshold = 0.1;
        this.bufferSize = 2048;
    }

    detect(buffer) {
        // RMS 计算
        let rms = 0;
        for (let i = 0; i < buffer.length; i++) {
            rms += buffer[i] * buffer[i];
        }
        rms = Math.sqrt(rms / buffer.length);

        // 噪声门限
        if (rms < 0.02) {
            return { frequency: -1, confidence: 0, rms: rms };
        }

        const yinBuffer = new Float32Array(buffer.length / 2);

        // YIN 差分函数
        for (let tau = 0; tau < yinBuffer.length; tau++) {
            yinBuffer[tau] = 0;
            for (let j = 0; j < yinBuffer.length; j++) {
                const delta = buffer[j] - buffer[j + tau];
                yinBuffer[tau] += delta * delta;
            }
        }

        // 累积均值归一化差分函数 (CMND)
        yinBuffer[0] = 1;
        let runningSum = 0;
        for (let tau = 1; tau < yinBuffer.length; tau++) {
            runningSum += yinBuffer[tau];
            yinBuffer[tau] *= tau / runningSum;
        }

        // 寻找最小值
        let tauEstimate = -1;
        let minVal = Infinity;

        for (let tau = 2; tau < yinBuffer.length; tau++) {
            if (yinBuffer[tau] < this.threshold) {
                // 抛物线插值提高精度
                if (tau + 1 < yinBuffer.length && tau > 0) {
                    const alpha = yinBuffer[tau - 1];
                    const beta = yinBuffer[tau];
                    const gamma = yinBuffer[tau + 1];
                    const p = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma);
                    tauEstimate = tau + p;
                } else {
                    tauEstimate = tau;
                }
                minVal = yinBuffer[tau];
                break;
            }
        }

        if (tauEstimate === -1) {
            return { frequency: -1, confidence: 0, rms: rms };
        }

        const frequency = this.sampleRate / tauEstimate;
        return { frequency, confidence: 1 - minVal, rms: rms };
    }
}

// 从频率获取音符信息
function noteFromFrequency(freq) {
    if (freq <= 0) return { note: '--', octave: 0, cents: 0 };

    const A4 = 440;
    const C0 = A4 * Math.pow(2, -4.75);
    const halfStepsBelowMiddleC = 12 * Math.log2(freq / C0);
    const octave = Math.floor(halfStepsBelowMiddleC / 12);
    const noteIndex = Math.round(halfStepsBelowMiddleC) % 12;
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    // 计算音分偏差
    const exactHalfSteps = 12 * Math.log2(freq / C0);
    const cents = Math.round((exactHalfSteps - Math.round(exactHalfSteps)) * 100);

    return {
        note: noteNames[(noteIndex + 12) % 12],
        octave: octave,
        cents: cents
    };
}

// 调音器状态
let tunerAudioContext = null;
let tunerAnalyser = null;
let tunerStream = null;
let isTunerRunning = false;
let yinDetector = null;
let tunerRafId = null;
let lastNote = '';
let stableCount = 0;

// 切换调音器
async function toggleTuner() {
    if (isTunerRunning) {
        stopTuner();
    } else {
        await startTuner();
    }
}

// 启动调音器
async function startTuner() {
    try {
        tunerAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        yinDetector = new YINDetector(tunerAudioContext.sampleRate);

        tunerStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false
            }
        });

        const source = tunerAudioContext.createMediaStreamSource(tunerStream);
        tunerAnalyser = tunerAudioContext.createAnalyser();
        tunerAnalyser.fftSize = 4096;
        source.connect(tunerAnalyser);

        isTunerRunning = true;

        // 更新 UI
        document.getElementById('tuner-toggle-btn').textContent = '⏹️ 停止调音';
        document.getElementById('tuner-toggle-btn').classList.add('btn-recording');
        document.getElementById('status-dot').classList.add('active');
        document.getElementById('status-text').textContent = '正在调音';

        processTunerAudio();
    } catch (err) {
        console.error('调音器启动失败:', err);
        alert('无法访问麦克风，请确保已授予权限');
    }
}

// 停止调音器
function stopTuner() {
    isTunerRunning = false;

    if (tunerRafId) {
        cancelAnimationFrame(tunerRafId);
        tunerRafId = null;
    }

    if (tunerStream) {
        tunerStream.getTracks().forEach(t => t.stop());
        tunerStream = null;
    }

    if (tunerAudioContext) {
        tunerAudioContext.close();
        tunerAudioContext = null;
    }

    // 重置 UI
    document.getElementById('tuner-toggle-btn').textContent = '🎤 开始调音';
    document.getElementById('tuner-toggle-btn').classList.remove('btn-recording');
    document.getElementById('status-dot').classList.remove('active');
    document.getElementById('status-text').textContent = '未启动';
    document.getElementById('tuner-note').textContent = '--';
    document.getElementById('tuner-freq').textContent = '0.0 Hz';
    document.getElementById('tuner-cents').textContent = '偏差: 0 音分';

    // 重置指针
    const needle = document.getElementById('tuner-needle');
    if (needle) {
        needle.setAttribute('transform', 'rotate(-90, 150, 150)');
    }
}

// 处理音频数据
function processTunerAudio() {
    if (!isTunerRunning) return;

    const buffer = new Float32Array(tunerAnalyser.fftSize);
    tunerAnalyser.getFloatTimeDomainData(buffer);

    const result = yinDetector.detect(buffer);

    if (result.frequency > 0 && result.confidence > 0.7) {
        const noteInfo = noteFromFrequency(result.frequency);

        // 稳定性检测
        if (noteInfo.note === lastNote) {
            stableCount++;
        } else {
            stableCount = 0;
            lastNote = noteInfo.note;
        }

        // 更新显示
        if (stableCount > 3) {
            document.getElementById('tuner-note').textContent = noteInfo.note + noteInfo.octave;
            document.getElementById('tuner-freq').textContent = result.frequency.toFixed(1) + ' Hz';
            document.getElementById('tuner-cents').textContent = '偏差: ' + (noteInfo.cents > 0 ? '+' : '') + noteInfo.cents + ' 音分';

            // 更新指针角度 (-90度到+90度)
            const angle = Math.max(-90, Math.min(90, noteInfo.cents * 1.5));
            const needle = document.getElementById('tuner-needle');
            if (needle) {
                needle.setAttribute('transform', `rotate(${angle}, 150, 150)`);
            }

            // 根据准确度变色
            const noteEl = document.getElementById('tuner-note');
            if (Math.abs(noteInfo.cents) < 5) {
                noteEl.style.color = '#27ae60'; // 绿色
                document.getElementById('status-text').textContent = '音准正确 ✓';
            } else if (Math.abs(noteInfo.cents) < 20) {
                noteEl.style.color = '#f39c12'; // 橙色
                document.getElementById('status-text').textContent = '接近正确...';
            } else {
                noteEl.style.color = '#e74c3c'; // 红色
                document.getElementById('status-text').textContent = noteInfo.cents < 0 ? '音偏低 ↓' : '音偏高 ↑';
            }
        }
    }

    tunerRafId = requestAnimationFrame(processTunerAudio);
}

// 播放标准音高
function playString(freq, name, btnElement) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // 使用锯齿波 + 正弦波混合模拟大提琴音色
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc1.frequency.value = freq;
    osc1.type = 'sawtooth';

    osc2.frequency.value = freq * 2;
    osc2.type = 'sine';
    osc2.connect(gain);

    filter.type = 'lowpass';
    filter.frequency.value = freq * 3;

    osc1.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2);

    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 2);
    osc2.stop(ctx.currentTime + 2);

    // 视觉反馈
    document.querySelectorAll('.string-btn').forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');
    setTimeout(() => btnElement.classList.remove('active'), 2000);
}
