/*
 * jsPsychRewardChoice: one choice trial of the Boger & Firestone reward-learning game.
 *
 * A port of runTrial / revealImages / respond from the original E04 index.html (Tal Boger).
 * The timing and feedback follow the original exactly:
 *
 *   pre_ms (500)  boxes empty, coin bank and piggy bank visible
 *   reveal        both options appear; RT is timed from here
 *   response      left/right arrow; no time limit
 *   feedback      ding + coin dropping into the pig (+5) or buzz; boxes emptied
 *   post_ms (500) then the trial ends
 *
 * In the original the 1 s coin animation simply kept running into the next trial's 500 ms
 * pre-period. jsPsych redraws the screen between trials, so `coin_in_flight` restarts it
 * half-way through to show the same thing.
 */
var jsPsychRewardChoice = (function (jspsych) {
  "use strict";

  const info = {
    name: "reward-choice",
    version: "1.0.0",
    parameters: {
      /** HTML shown above the game (title). */
      header: { type: jspsych.ParameterType.HTML_STRING, default: "" },
      /** HTML for the content of the left and right boxes. */
      left: { type: jspsych.ParameterType.HTML_STRING, default: undefined },
      right: { type: jspsych.ParameterType.HTML_STRING, default: undefined },
      /** "left" or "right": where the complex option is. */
      complex_position: { type: jspsych.ParameterType.STRING, default: undefined },
      /** "complex" or "simple": which option earns the coins. */
      reward_condition: { type: jspsych.ParameterType.STRING, default: undefined },
      /** Coins in the bank when the trial starts. */
      coin_count: { type: jspsych.ParameterType.INT, default: 0 },
      /** Coins added for a rewarded choice. */
      reward_amount: { type: jspsych.ParameterType.INT, default: 5 },
      /** Whether the empty boxes are already on screen during the pre-period. */
      boxes_visible_at_start: { type: jspsych.ParameterType.BOOL, default: true },
      /** Whether the previous trial's coin is still falling when this trial starts. */
      coin_in_flight: { type: jspsych.ParameterType.BOOL, default: false },
      pre_ms: { type: jspsych.ParameterType.INT, default: 500 },
      post_ms: { type: jspsych.ParameterType.INT, default: 500 },
      correct_sound: { type: jspsych.ParameterType.STRING, default: "stimuli/sounds/ding.wav" },
      incorrect_sound: { type: jspsych.ParameterType.STRING, default: "stimuli/sounds/buzz.wav" },
    },
    data: {
      /** "left" or "right" */
      response: { type: jspsych.ParameterType.STRING },
      /** ms from the options appearing to the key press, rounded to 0.1 ms as in the original */
      rt: { type: jspsych.ParameterType.FLOAT },
      /** 1 if the choice earned coins, else 0 */
      gotReward: { type: jspsych.ParameterType.INT },
      /** coins in the bank after this trial */
      coinCount: { type: jspsych.ParameterType.INT },
      /** how the feedback sound was played: "webaudio" or "audio-element:<reason>" */
      soundPlayback: { type: jspsych.ParameterType.STRING },
    },
  };

  // Feedback sounds. Each file is downloaded and decoded once with the Web Audio API, then
  // played from memory, so playback starts at the key press with no network request.
  //
  // Browsers keep a page's audio context suspended until the participant interacts with the
  // page, and they differ (and remember per site) in which interactions count. So the context
  // is resumed on every kind of interaction, and if it is still not running when a sound is
  // due, that sound plays through an <audio> element instead, which a key press is always
  // allowed to start. Each choice trial records which route was used (soundPlayback).
  const sounds = {}; // src -> { buffer, source, element }
  let ctx = null;

  function audioContext() {
    if (ctx === null) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = AC ? new AC() : false;
      if (ctx) {
        const unlock = () => { if (ctx.state !== "running") ctx.resume().catch(() => {}); };
        ["pointerdown", "pointerup", "mousedown", "click", "keydown", "keyup", "touchend"]
          .forEach((t) => document.addEventListener(t, unlock, true));
      }
    }
    return ctx;
  }

  function loadSound(src) {
    if (sounds[src]) return sounds[src];
    // The <audio> element is created up front so it is ready if it is ever needed.
    const element = new Audio(src);
    element.preload = "auto";
    const entry = { buffer: null, source: null, element: element };
    sounds[src] = entry;
    const c = audioContext();
    if (!c) return entry;
    fetch(src)
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
      .then((data) => new Promise((resolve, reject) => c.decodeAudioData(data, resolve, reject)))
      .then((buffer) => { entry.buffer = buffer; })
      .catch((e) => console.warn("[reward-choice] could not decode " + src + "; using an <audio> element", e));
    return entry;
  }

  // The original paused and rewound both sounds before playing one.
  function stopSounds() {
    Object.values(sounds).forEach((e) => {
      if (e.source) { try { e.source.stop(); } catch (err) {} e.source = null; }
      e.element.pause();
      e.element.currentTime = 0;
    });
  }

  /**
   * Play a sound. Returns how: "webaudio", or "audio-element" with the reason Web Audio was
   * not used ("audio-element:context-<state>", "audio-element:not-decoded",
   * "audio-element:no-webaudio").
   */
  function playSound(src) {
    const entry = loadSound(src);
    const c = audioContext();
    if (c && c.state !== "running") c.resume().catch(() => {});
    if (c && entry.buffer && c.state === "running") {
      const source = c.createBufferSource();
      source.buffer = entry.buffer;
      source.connect(c.destination);
      source.start();
      entry.source = source;
      return "webaudio";
    }
    const reason = !c ? "no-webaudio" : !entry.buffer ? "not-decoded" : "context-" + c.state;
    console.warn("[reward-choice] playing " + src + " through an <audio> element (" + reason + ")");
    entry.element.currentTime = 0;
    // play() rejects if the browser blocks audio; the trial must go on regardless.
    entry.element.play().catch((e) => console.warn("[reward-choice] <audio> play() was blocked", e));
    return "audio-element:" + reason;
  }

  const PIG_HTML = `
    <div class="piggy-wrapper">
      <div class="piggy-wrap">
        <div class="piggy">
          <div class="piggy-logo"></div>
          <div class="nose"></div>
          <div class="mouth"></div>
          <div class="ear"></div>
          <div class="tail"><span></span><span></span><span></span><span></span></div>
          <div class="eye"></div>
          <div class="hole"></div>
        </div>
      </div>
      <div class="coin-wrap"><div class="coin"></div></div>
      <div class="legs"></div>
      <div class="legs back"></div>
    </div>`;

  class RewardChoicePlugin {
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }

    trial(display_element, trial) {
      const api = this.jsPsych.pluginAPI;
      display_element.innerHTML = `
        ${trial.header}
        <div class="e4-trial" data-complex-position="${trial.complex_position}"
             data-reward-condition="${trial.reward_condition}">
          <p class="e4-trial-instructions">To choose the option on the left, press the <span class="keyboardkey">&#8592;</span> key on your keyboard (the left arrow key).</p>
          <p class="e4-trial-instructions">To choose the option on the right, press the <span class="keyboardkey">&#8594;</span> key on your keyboard (the right arrow key).</p>
          <div class="e4-row">
            <div class="e4-box" id="e4-box-left"><div class="e4-option" id="e4-option-left">${trial.left}</div></div>
            <div class="e4-bank">
              <p class="e4-coin-count" id="e4-coin-count">Coin bank: ${trial.coin_count}</p>
              ${PIG_HTML}
            </div>
            <div class="e4-box" id="e4-box-right"><div class="e4-option" id="e4-option-right">${trial.right}</div></div>
          </div>
        </div>`;

      const root = display_element.querySelector(".e4-trial");
      const boxes = display_element.querySelectorAll(".e4-box");
      const options = display_element.querySelectorAll(".e4-option");
      const coinWrap = display_element.querySelector(".coin-wrap");

      boxes.forEach((b) => (b.style.visibility = trial.boxes_visible_at_start ? "visible" : "hidden"));
      options.forEach((o) => (o.style.visibility = "hidden"));
      coinWrap.style.animation = trial.coin_in_flight ? "moveCoin 1s linear -0.5s 1" : "none";

      let t0;
      const reveal = () => {
        coinWrap.style.animation = "none";
        options.forEach((o) => (o.style.visibility = "visible"));
        boxes.forEach((b) => (b.style.visibility = "visible"));
        root.classList.add("e4-revealed");
        t0 = performance.now();
        api.getKeyboardResponse({
          callback_function: respond,
          valid_responses: ["ArrowLeft", "ArrowRight"],
          rt_method: "performance",
          persist: false,
          allow_held_key: false,
        });
      };

      const respond = (info) => {
        const rt = performance.now() - t0;
        const response = info.key.toLowerCase() === "arrowleft" ? "left" : "right";
        options.forEach((o) => (o.style.visibility = "hidden"));
        root.classList.remove("e4-revealed");

        stopSounds();
        const choseComplex = response === trial.complex_position;
        const gotReward = (trial.reward_condition === "complex") === choseComplex ? 1 : 0;
        let coinCount = trial.coin_count;
        const soundPlayback = playSound(gotReward ? trial.correct_sound : trial.incorrect_sound);
        if (gotReward) {
          coinWrap.style.animation = "moveCoin 1s linear 1";
          coinCount += trial.reward_amount;
          display_element.querySelector("#e4-coin-count").textContent = "Coin bank: " + coinCount;
        }

        api.setTimeout(() => {
          this.jsPsych.finishTrial({
            response: response,
            rt: Math.round(rt * 10) / 10,
            gotReward: gotReward,
            coinCount: coinCount,
            soundPlayback: soundPlayback,
          });
        }, trial.post_ms);
      };

      api.setTimeout(reveal, trial.pre_ms);
    }
  }
  RewardChoicePlugin.info = info;
  /** Download and decode the sounds ahead of the first trial. */
  RewardChoicePlugin.preloadSounds = (srcs) => srcs.forEach(loadSound);
  /** For debugging: whether each sound is decoded, and the audio context's state. */
  RewardChoicePlugin.audioStatus = () => ({
    context: ctx ? ctx.state : ctx === false ? "unavailable" : "not created",
    sounds: Object.fromEntries(Object.entries(sounds).map(([s, e]) => [s, e.buffer ? "decoded" : "not decoded (will use <audio>)"])),
  });

  return RewardChoicePlugin;
})(jsPsychModule);
