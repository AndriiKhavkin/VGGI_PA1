'use strict';

/*
 * MSVR PA#3 / Calculation Work — Spatial Audio
 * Variant 14: Low-frequency shelf filter.
 *
 * Signal chain:
 * HTMLAudioElement(mp3/ogg)
 *      -> MediaElementAudioSourceNode
 *      -> BiquadFilterNode(lowshelf)
 *      -> PannerNode
 *      -> GainNode
 *      -> destination
 */

function AudioEngine(orbitRadius) {
    this.ctx = null;

    this.audio = null;
    this.source = null;
    this.filter = null;
    this.panner = null;
    this.gain = null;

    this.ready = false;
    this.playing = false;

    this.orbitRadius = orbitRadius || 2.0;

    this.filterEnabled = true;
    this.filterFreq = 320.0;
    this.filterGain = 8.0;
    this.volume = 0.65;

    this.audioUrl = "audio/zara-larsson-lush-life.mp3";

    this.init = function () {
        if (this.ready) return;

        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new Ctx();

        this.audio = new Audio(this.audioUrl);
        this.audio.crossOrigin = "anonymous";
        this.audio.loop = true;
        this.audio.preload = "auto";

        this.source = this.ctx.createMediaElementSource(this.audio);

        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = "lowshelf";
        this.filter.frequency.value = this.filterFreq;
        this.filter.gain.value = this.filterGain;

        this.panner = this.ctx.createPanner();
        this.panner.panningModel = "HRTF";
        this.panner.distanceModel = "inverse";
        this.panner.refDistance = 1.0;
        this.panner.maxDistance = 40.0;
        this.panner.rolloffFactor = 1.0;

        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0.0;

        const listener = this.ctx.listener;

        if (listener.positionX) {
            listener.positionX.value = 0.0;
            listener.positionY.value = 0.0;
            listener.positionZ.value = 0.0;

            listener.forwardX.value = 0.0;
            listener.forwardY.value = 0.0;
            listener.forwardZ.value = -1.0;

            listener.upX.value = 0.0;
            listener.upY.value = 1.0;
            listener.upZ.value = 0.0;
        } else {
            listener.setPosition(0.0, 0.0, 0.0);
            listener.setOrientation(0.0, 0.0, -1.0, 0.0, 1.0, 0.0);
        }

        this.rebuildChain();

        this.ready = true;
    };

    this.rebuildChain = function () {
        if (!this.source || !this.filter || !this.panner || !this.gain) return;

        try { this.source.disconnect(); } catch (e) {}
        try { this.filter.disconnect(); } catch (e) {}
        try { this.panner.disconnect(); } catch (e) {}
        try { this.gain.disconnect(); } catch (e) {}

        if (this.filterEnabled) {
            this.source.connect(this.filter);
            this.filter.connect(this.panner);
        } else {
            this.source.connect(this.panner);
        }

        this.panner.connect(this.gain);
        this.gain.connect(this.ctx.destination);
    };

    this.play = async function () {
        this.init();

        if (this.ctx.state === "suspended") {
            await this.ctx.resume();
        }

        this.playing = true;
        this.gain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.04);

        try {
            await this.audio.play();
        } catch (err) {
            console.warn("Audio file playback error:", err);
        }
    };

    this.pause = function () {
        if (!this.ready) return;

        this.playing = false;
        this.gain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.04);

        if (this.audio) {
            this.audio.pause();
        }
    };

    this.isPlaying = function () {
        return this.playing;
    };

    this.setSourcePosition = function (x, y, z) {
        if (!this.ready || !this.panner) return;

        if (this.panner.positionX) {
            this.panner.positionX.setTargetAtTime(x, this.ctx.currentTime, 0.02);
            this.panner.positionY.setTargetAtTime(y, this.ctx.currentTime, 0.02);
            this.panner.positionZ.setTargetAtTime(z, this.ctx.currentTime, 0.02);
        } else {
            this.panner.setPosition(x, y, z);
        }
    };

    this.setFilterEnabled = function (enabled) {
        this.filterEnabled = enabled;

        if (this.ready) {
            this.rebuildChain();
        }
    };

    this.setFilterFrequency = function (hz) {
        this.filterFreq = hz;

        if (this.ready) {
            this.filter.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.03);
        }
    };

    this.setFilterGain = function (db) {
        this.filterGain = db;

        if (this.ready) {
            this.filter.gain.setTargetAtTime(db, this.ctx.currentTime, 0.03);
        }
    };

    this.setVolume = function (value) {
        this.volume = value;

        if (this.ready && this.playing) {
            this.gain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.03);
        }
    };
}