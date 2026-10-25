/*
 * Replication of Boger & Firestone, "Complexity is a unified cognitive kind", Experiment 4
 * (reward learning, shapes -> math). Ported from the authors' original index.html
 * (code/Archive/E04. Reward-learning (shapes-math)/experiment/), keeping its instructions,
 * screens, stimuli, randomization and timing.
 *
 * Design
 *   IV (between):   rewardCondition, "complex" or "simple": which option earns +5 coins.
 *   Counterbalanced: blockOrder, ["shapes","math"] or ["math","shapes"]: the first type is
 *                   learned (12 trials), the second is the single transfer trial.
 *   DV:             gotReward on the transfer trial (blockNum 1, isTransferTrial true).
 *   Trials:         12 learning trials (complex side 6 left / 6 right, shuffled), a break
 *                   screen, 1 transfer trial (side random). 500 ms blank, options until a
 *                   left/right arrow press, feedback (ding + coin or buzz) on every trial
 *                   including the transfer trial, 500 ms.
 *   Exclusions (original analysis): participants with < 50% gotReward on learning trials;
 *                   trials with rt below 200 ms (the preregistered wording).
 *
 * Timeline
 *   1. consent           course-wide consent text (required at the start of every study)
 *   2. instructions      original text, ENTER to begin
 *   3. learning trials   12 x reward-choice (src/plugin-reward-choice.js)
 *   4. break             original text, ENTER to continue
 *   5. transfer trial    1 x reward-choice
 *   6. questions         original four questions + "What is 1 + 1?"
 *   7. comments          the original last page, with its "Submit results" button
 *   8. debrief           course-required debrief; "Finish" ends the study, then on_finish
 *                        saves and redirects to Prolific.
 */

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
window.TEMPLATE_VERSION = "0.1.0";

const EXPERIMENT = {
  // Firestore path: experiments/<id>/participants/... Change it when you start a new study
  // so pilot data and real data never mix (e.g. "smith2016-pilot-a", "smith2016-final").
  id: "boger2026-e4-pilot-b",

  // Trials per Firestore write. 1 = save every trial the moment it finishes (dropouts leave
  // partial data). The free tier allows 20,000 writes/day: with 200 participants x 100 trials
  // you would exceed it, so raise this for long trial-based tasks (e.g. 20).
  chunk_size: 1,

  // Also store the complete jsPsych dataset on the participant document at the end.
  // Costs one extra write and makes export robust; turn off if trials are very large.
  save_full_data_at_end: true,

  // Prolific: if set, participants are redirected to Prolific when they finish.
  // Leave empty for local testing or non-Prolific samples.
  prolific_completion_code: "C42QSRTV",

  // Contact shown in consent and debrief.
  contact_email: "stanfordpsych251@gmail.com",

  // Does this study need a physical keyboard? It does: choices are made with the arrow keys.
  // On a phone or tablet no keyboard appears, so a participant cannot answer those trials.
  // When true, such devices are turned away before consent.
  requires_keyboard: true,
};

// Values from the original script.
const ORIGINAL = {
  experimentName: "complexity",
  experimentVersion: "e4_shapes_math_transfer",
  nTrialsPerBlock: 12, // 12 learning trials
  itiTime: 1000,       // 1000 ms between trials: 500 ms before the options, 500 ms after the response
};

// True on anything with a mouse, trackpad, or stylus, including laptops with touchscreens.
// False on phones and tablets without a pointing device, which are also the devices with no
// physical keyboard. See docs/student-guide.md "Devices".
function hasFinePointer() {
  return !!(window.matchMedia && window.matchMedia("(any-pointer: fine)").matches);
}

// `?emulator=1` in the URL sends data to the local emulator instead of the real project.
// Used by `npm test`; handy for development too (start it with `npm run emulators`).
const URL_PARAMS = new URLSearchParams(window.location.search);
const USE_EMULATOR = URL_PARAMS.get("emulator") === "1";
// `?chunk_size=N` overrides the setting above; used by the test suite to exercise chunked writes.
const CHUNK_SIZE = Number(URL_PARAMS.get("chunk_size")) || EXPERIMENT.chunk_size;
// Test-only: `?cc=CODE` sets a Prolific completion code during emulator runs, so the test
// suite can check the screen a participant sees once you have set yours. Ignored in live runs.
if (USE_EMULATOR && URL_PARAMS.get("cc")) EXPERIMENT.prolific_completion_code = URL_PARAMS.get("cc");

// ---------------------------------------------------------------------------
// Helpers from the original script (unchanged apart from formatting)
// ---------------------------------------------------------------------------

// get random int, inclusive on both min and max
function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// for random simple/complex, can't be divisible by 10, can't be equal, and can't be divisible
function genInts() {
  let a, b, c, d;
  do {
    a = getRandomInt(11, 49);
    b = getRandomInt(11, 49);
    c = getRandomInt(11, 49);
    d = getRandomInt(11, 49);
  } while (
    a === b || a === c || a === d || b === c || b === d || c === d ||
    a % 10 === 0 || b % 10 === 0 || c % 10 === 0 || d % 10 === 0 ||
    Number.isInteger(a / b) || Number.isInteger(b / a) ||
    Number.isInteger(a / c) || Number.isInteger(c / a) ||
    Number.isInteger(b / c) || Number.isInteger(c / b) ||
    Number.isInteger(a / d) || Number.isInteger(d / a) ||
    Number.isInteger(b / d) || Number.isInteger(d / b) ||
    Number.isInteger(c / d) || Number.isInteger(d / c)
  );
  return [a, b, c, d];
}

function genRandomSimple(num1, num2, num3, num4) {
  var operator = '+';
  return `${num1}${operator}${num2}${operator}${num3}${operator}${num4}`;
}

function genRandomComplex(num1, num2, num3, num4) {
  return `
  <span class="fraction">
    <span class="top">${num1}<sup>${num2}</sup> &times; ${num3}</span>
    <span class="bottom">${num4}</span>
  </span>
  `
}

// get browser used in the experiment
// taken from https://stackoverflow.com/questions/5916900/how-can-you-detect-the-version-of-a-browser
function getBrowser() {
  var ua = navigator.userAgent, tem, M = ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];
  if (/trident/i.test(M[1])) {
    tem = /\brv[ :]+(\d+)/g.exec(ua) || [];
    return { name: 'IE', version: (tem[1] || '') };
  }
  if (M[1] === 'Chrome') {
    tem = ua.match(/\bOPR|Edge\/(\d+)/)
    if (tem != null) {
      return { name: 'Opera', version: tem[1] };
    }
  }
  M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, '-?'];
  if ((tem = ua.match(/version\/(\d+)/i)) != null) {
    M.splice(1, 1, tem[1]);
  }
  return { name: M[0], version: M[1] };
}

// shuffle array randomly (in place, and returned)
// taken from https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
function shuffle(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

// Shape image files: the simple version of shape N is shapeN_sm7.png, the complex version shapeN_sm1.png.
function shapePath(n, kind) {
  return "stimuli/shapes/shape" + n + (kind === "simple" ? "_sm7" : "_sm1") + ".png";
}

// ---------------------------------------------------------------------------
// Boot: connect the saver first so even a crash in the first trial gets logged.
// ---------------------------------------------------------------------------
(async function main() {
  const deviceSupported = !EXPERIMENT.requires_keyboard || hasFinePointer();

  const saver = await DataSaver.init({
    experiment_id: EXPERIMENT.id,
    chunk_size: CHUNK_SIZE,
    save_full_data_at_end: EXPERIMENT.save_full_data_at_end,
    use_emulator: USE_EMULATOR,
    contact_email: EXPERIMENT.contact_email,
  });
  window.__saver = saver; // for debugging and the automated test

  // Record the device verdict on the participant document before anything else, so a
  // participant turned away below is still visible in the data rather than simply absent.
  saver.updateParticipant({ device_supported: deviceSupported, requires_keyboard: EXPERIMENT.requires_keyboard });

  if (!deviceSupported) {
    document.body.innerHTML =
      '<div id="device-unsupported" class="jspsych-content" style="max-width:640px;margin:15vh auto;font:16px/1.6 system-ui,sans-serif;">' +
      "<h2>Please use a computer</h2>" +
      "<p>This study needs a computer with a physical keyboard, because part of it is answered " +
      "by pressing keys. Phones and tablets cannot be used.</p>" +
      "<p>Please reopen this link on a laptop or desktop computer. If you were sent here from " +
      "Prolific, you can return the study and take it later on a computer; nothing has been recorded " +
      "against you.</p>" +
      "<p>Questions: <a href=\"mailto:" + EXPERIMENT.contact_email + "\">" + EXPERIMENT.contact_email + "</a></p></div>";
    return;
  }

  const jsPsych = initJsPsych({
    show_progress_bar: true,
    auto_update_progress_bar: true,
    on_data_update: (trial) => saver.onTrial(trial),
    on_finish: async () => {
      const el = jsPsych.getDisplayElement();
      el.innerHTML = '<div id="finish-message"><p class="thanks">Saving your responses…</p></div>';
      // finish() flushes remaining trials, marks the participant complete, and (only if
      // saving failed) appends a download-fallback box to the display element.
      const result = await saver.finish(jsPsych);
      const consentRow = jsPsych.data.get().filter({ task: "consent" }).values()[0];
      const consented = !consentRow || consentRow.consented !== false;
      const msg = document.getElementById("finish-message");

      if (!consented) {
        msg.innerHTML = "<h2 class='thanks'>Thank you</h2><p class='thanks'>You chose not to participate. " +
          "You may close this window" + (EXPERIMENT.prolific_completion_code ? " and return the study on Prolific" : "") + ".</p>";
        return;
      }
      if (result.ok && EXPERIMENT.prolific_completion_code && !USE_EMULATOR) {
        msg.innerHTML = "<p class='thanks'>Saved. Returning you to Prolific…</p>";
        window.location.href =
          "https://app.prolific.com/submissions/complete?cc=" + EXPERIMENT.prolific_completion_code;
        return;
      }
      // In emulator/test runs we stay on the page instead of navigating to Prolific, so that
      // setting a completion code can never turn `npm test` or CI red. Live runs redirect above.
      msg.innerHTML =
        "<h2 class='thanks'>All done</h2>" +
        (result.ok ? "<p class='thanks'>Your responses were saved. Thank you for participating!</p>" : "") +
        (EXPERIMENT.prolific_completion_code
          ? "<p class='thanks'>Your completion code is <strong>" + EXPERIMENT.prolific_completion_code + "</strong>.</p>"
          : "");
    },
  });

  // Record the participant id and URL parameters on every trial row.
  jsPsych.data.addProperties({
    // Must be the run-scoped document id, so trial rows join to participants.csv on export.
    participant_id: saver.docId,
    prolific_pid: saver.params.PROLIFIC_PID || null,
    experiment_id: EXPERIMENT.id,
  });

  // -------------------------------------------------------------------------
  // Random assignment, exactly as in the original: reward condition 50/50, block order
  // shuffled. Recorded on every trial row and on the participant document.
  // -------------------------------------------------------------------------
  const blockOrder = shuffle(["shapes", "math"]);
  const rewardCondition = Math.random() < 0.5 ? "complex" : "simple";
  const browserInfo = getBrowser();
  const participantInfo = {
    condition: rewardCondition,
    rewardCondition: rewardCondition,
    blockOrder: blockOrder.join(","),
    learningStimType: blockOrder[0],
    transferStimType: blockOrder[1],
    experimentName: ORIGINAL.experimentName,
    experimentVersion: ORIGINAL.experimentVersion,
  };
  jsPsych.data.addProperties(participantInfo);
  saver.updateParticipant(participantInfo);

  // -------------------------------------------------------------------------
  // Trial list (the original generateTrials): block 0 is 12 learning trials of the first
  // stimulus type; block 1 is a single transfer trial of the second type.
  // -------------------------------------------------------------------------
  const simpleShapeOptions = shuffle(Array.from({ length: 30 }, (_, i) => i + 1));
  const complexShapeOptions = shuffle(Array.from({ length: 30 }, (_, i) => i + 1));
  const nTrialsPerBlock = ORIGINAL.nTrialsPerBlock;
  const trials = [];
  for (let i = 0; i < 2; i++) {
    const leftRight = shuffle(Array(nTrialsPerBlock / 2).fill("left").concat(Array(nTrialsPerBlock / 2).fill("right")));
    const nThisBlock = i === 0 ? nTrialsPerBlock : 1;
    for (let j = 0; j < nThisBlock; j++) {
      const t = { blockNum: i, stimType: blockOrder[i] };
      if (t.stimType === "shapes") {
        t.simpleStim = simpleShapeOptions.shift();
        t.complexStim = complexShapeOptions.shift();
      } else {
        const [int1, int2, int3, int4] = genInts();
        t.simpleStim = genRandomSimple(int1, int2, int3, int4);
        t.complexStim = genRandomComplex(int1, int2, int3, int4);
      }
      t.isTransferTrial = i === 1;
      t.complexPosition = leftRight[j];
      t.rewardCondition = rewardCondition;
      t.trialID = trials.length;
      trials.push(t);
    }
  }

  // Preload the shape images in the background, as the original did.
  const preloaded = ["stimuli/shapes/filler.png"];
  trials.filter((t) => t.stimType === "shapes").forEach((t) => {
    preloaded.push(shapePath(t.simpleStim, "simple"), shapePath(t.complexStim, "complex"));
  });
  window.__preloadedImages = preloaded.map((src) => { const img = new Image(); img.src = src; return img; });
  // The original also created its two sounds on page load, so the first feedback is not delayed.
  jsPsychRewardChoice.preloadSounds(["stimuli/sounds/ding.wav", "stimuli/sounds/buzz.wav"]);

  // The title (and, for unsupported browsers, the original's warning) sits above every game screen.
  const browserUnsupported = browserInfo.name == "msie" || browserInfo.name == "Opera";
  const header =
    '<p class="e4-title"><strong>Visual game!</strong></p>' +
    (browserUnsupported
      ? '<p class="e4-title"><strong>Unfortunately, this study does not work in your current browser. Please use Chrome, Firefox, or Safari. Sorry!</strong></p>'
      : "");

  // Times used for the original's experimentTime and totalTime. The original started its
  // clock on page load, which showed the instructions; here that is the instructions screen.
  let startHITTime = null;
  let coinCount = 0;

  // -------------------------------------------------------------------------
  // 1. Consent (course-wide IRB text; edit only the contact address)
  // -------------------------------------------------------------------------
  const consent = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="consent">
        <h2>Consent</h2>
        <p>By answering the following questions, you are participating in a study being performed by
        cognitive scientists in the Stanford Department of Psychology. If you have questions about
        this research, please contact us at <a href="mailto:${EXPERIMENT.contact_email}">${EXPERIMENT.contact_email}</a>.
        You must be at least 18 years old to participate. Your participation in this research is
        voluntary. You may decline to answer any or all of the following questions. You may decline
        further participation, at any time, without adverse consequences. Your anonymity is assured;
        the researchers who have requested your participation will not receive any personal
        information about you.</p>
      </div>`,
    choices: ["I agree to participate", "I do not agree"],
    data: { task: "consent" },
    on_finish: (data) => {
      data.consented = data.response === 0;
      if (!data.consented) {
        // No end message here: jsPsych would paint it over the screen that on_finish renders.
        jsPsych.abortExperiment();
      }
    },
  };

  // -------------------------------------------------------------------------
  // 2. Instructions (original text)
  // -------------------------------------------------------------------------
  const instructions = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: `${header}
      <div class="e4-text" id="e4-instructions">
        <p>In this experiment, you'll play a simple visual game.</p>
        <p>In each turn of the game, you'll see two images. You'll be able to choose between them; when you choose an image, you will either get +5 coins, or +0 coins to your coin bank. Your goal is to end the game with as many coins as possible.</p>
        <p>It's your job to figure out which image will give you more coins to do well at the game. This may not always be easy and it may take a little while to learn, but keep playing the game and trying to earn as many coins as you can.</p>
        <p>Sometimes, these 'images' will just be mathematical expressions; but the same ideas apply. Note that you don't have to solve these expressions or determine their answers; just look at the problems themselves. Try to figure out which option gives you coins, and choose that.</p>
        <p>To choose the option on the left, press the <span class="keyboardkey">&#8592;</span> key on your keyboard (the left arrow key). To choose the option on the right, press the <span class="keyboardkey">&#8594;</span> key on your keyboard (the right arrow key).</p>
        <p>Click the <span class="keyboardkey">ENTER</span> key on your keyboard to begin!</p>
      </div>`,
    choices: ["Enter"],
    data: { task: "instructions" },
    on_load: () => { startHITTime = performance.now(); },
  };

  // -------------------------------------------------------------------------
  // 3-5. Learning trials, break, transfer trial
  // -------------------------------------------------------------------------
  function optionHtml(t, kind) {
    if (t.stimType === "shapes") {
      const n = kind === "simple" ? t.simpleStim : t.complexStim;
      return `<img class="e4-img" src="${shapePath(n, kind)}" height="300" width="300">`;
    }
    return `<p class="e4-math">${kind === "simple" ? t.simpleStim : t.complexStim}</p>`;
  }

  function choiceTrial(t) {
    const complexLeft = t.complexPosition === "left";
    return {
      type: jsPsychRewardChoice,
      header: header,
      left: optionHtml(t, complexLeft ? "complex" : "simple"),
      right: optionHtml(t, complexLeft ? "simple" : "complex"),
      complex_position: t.complexPosition,
      reward_condition: t.rewardCondition,
      coin_count: () => coinCount,
      // The original hid the boxes before the first trial and after the break, and otherwise
      // left the emptied boxes on screen between trials.
      boxes_visible_at_start: t.trialID !== 0 && !t.isTransferTrial,
      // Previous choice rewarded and no break in between: its coin is still falling.
      coin_in_flight: () => {
        if (t.trialID === 0 || t.isTransferTrial) return false;
        return jsPsych.data.getLastTrialData().values()[0].gotReward === 1;
      },
      pre_ms: ORIGINAL.itiTime / 2,
      post_ms: ORIGINAL.itiTime / 2,
      data: Object.assign({ task: "choice" }, t),
      on_finish: (data) => { coinCount = data.coinCount; },
    };
  }

  const breakScreen = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: `${header}
      <div class="e4-text" id="e4-break">
        <p>Great job! Now, you'll just make one more choice.</p>
        <p>Even though the options here look a little different, the same pattern that you just learned also applies here.</p>
        <p>So, based on what you know, take your best guess about which option is worth more points.</p>
        <p>When you're ready to continue, click the <span class="keyboardkey">ENTER</span> key on your keyboard.</p>
      </div>`,
    choices: ["Enter"],
    data: { task: "break" },
  };

  // -------------------------------------------------------------------------
  // 6. Questions (original). "Next" appears once every text question has been answered and
  // the 1 + 1 check equals 2. As in the original, a question counts as answered from the
  // first keystroke on (clearing it afterwards does not hide the button again).
  // -------------------------------------------------------------------------
  const questionIds = ["taskGuess", "purposeGuess", "strategyLearn", "strategyTransfer"];
  const answers = {};
  const questions = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="e4-text" id="e4-questions">
        <p><strong>Please answer the following questions.</strong></p>
        <p>Please describe the task you had to complete in this study.</p>
        <textarea id="taskGuess" rows="2" cols="40" placeholder="Enter your answer here..."></textarea>
        <p>If you had to guess, what do you think was the purpose of this study?</p>
        <textarea id="purposeGuess" rows="2" cols="40" placeholder="Enter your answer here..."></textarea>
        <p>How did you decide which images to choose in the first part of the experiment?</p>
        <textarea id="strategyLearn" rows="2" cols="40" placeholder="Enter your answer here..."></textarea>
        <p>How did you decide which image to choose in the last trial?</p>
        <textarea id="strategyTransfer" rows="2" cols="40" placeholder="Enter your answer here..."></textarea>
        <p>What is 1 + 1?</p>
        <textarea id="sumCheck" rows="1" cols="20" placeholder="Enter your answer here..."></textarea>
      </div>`,
    choices: ["Next"],
    data: { task: "questions" },
    on_load: () => {
      const el = jsPsych.getDisplayElement();
      const buttons = el.querySelector("#jspsych-html-button-response-btngroup");
      buttons.style.visibility = "hidden";
      const answered = {};
      [...questionIds, "sumCheck"].forEach((id) => {
        answers[id] = "";
        el.querySelector("#" + id).addEventListener("input", function () {
          answers[id] = this.value;
          if (id === "sumCheck" ? this.value == 2 : this.value.length >= 1) answered[id] = true;
          if ([...questionIds, "sumCheck"].every((q) => answered[q])) buttons.style.visibility = "visible";
        });
      });
    },
    on_finish: (data) => {
      Object.assign(data, answers);
      saver.updateParticipant(answers);
    },
  };

  // -------------------------------------------------------------------------
  // 7. Comments: the original last page. Its first sentence is edited (a difference from the
  // original) because the debrief now follows it.
  // -------------------------------------------------------------------------
  let comment = "";
  let experimentTime = null;
  const comments = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="e4-text" id="e4-comments">
        <p><strong>This is the last page of questions. Do not close your browser! After you submit your results, you will see a short note and then be redirected to Prolific.</strong></p>
        <p>You can also feel free to leave any comments below about how the experiment went, but that's up to you. Did everything seem to work OK?</p>
        <textarea id="commentBox" rows="4" cols="40" placeholder="Enter your comments here..."></textarea>
      </div>`,
    choices: ["Submit results"],
    data: { task: "comments" },
    on_load: () => {
      // The original's experimentTime: from the start until this page appeared.
      experimentTime = Math.round((performance.now() - startHITTime) * 10) / 10;
      jsPsych.getDisplayElement().querySelector("#commentBox").addEventListener("input", function () {
        comment = this.value;
      });
    },
    on_finish: (data) => {
      const wrapup = {
        commentText: comment,
        experimentTime: experimentTime,
        totalTime: Math.round((performance.now() - startHITTime) * 10) / 10,
        browserName: browserInfo.name,
        browserVersion: browserInfo.version,
        displayWindowHeight: window.innerHeight,
        displayWindowWidth: window.innerWidth,
        displayScreenHeight: screen.height,
        displayScreenWidth: screen.width,
      };
      Object.assign(data, wrapup);
      saver.updateParticipant(wrapup);
    },
  };

  // -------------------------------------------------------------------------
  // 8. Debrief (course requirement; not in the original). "Finish" ends the study;
  // on_finish above then saves everything and redirects to Prolific.
  // -------------------------------------------------------------------------
  const debrief = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="e4-text" id="e4-debrief">
        <p>Thank you for participating! This study tested whether people who learn to pick the more complex (or the simpler) option in one kind of image apply the same rule to a different kind. Please do not share this with anyone who might take part.</p>
      </div>`,
    choices: ["Finish"],
    data: { task: "debrief" },
  };

  const learning = trials.filter((t) => !t.isTransferTrial).map(choiceTrial);
  const transfer = trials.filter((t) => t.isTransferTrial).map(choiceTrial);

  await jsPsych.run([
    consent,
    instructions,
    ...learning,
    breakScreen,
    ...transfer,
    questions,
    comments,
    debrief,
  ]);
})();
