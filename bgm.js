(function () {
  var KEY = "resume-bgm-off";
  var TARGET = 0.35;
  var FADE_OUT_MS = 700;
  var FADE_IN_MS = 1400;
  var RESUME_DELAY_MS = 2000;

  var style = document.createElement("style");
  style.textContent =
    ".bgm-btn{position:fixed;right:18px;bottom:18px;z-index:40;padding:8px 14px;" +
    "border:1px solid var(--line,#d9d0c3);border-radius:999px;background:var(--card,#fffdf8);" +
    "color:var(--ink,#1c1915);font:650 14px/1.4 Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;" +
    "cursor:pointer}" +
    ".bgm-btn:hover{border-color:var(--copper,#b4532a);color:var(--copper,#b4532a)}" +
    ".bgm-btn:focus-visible{outline:2px solid var(--copper,#b4532a);outline-offset:2px}";
  document.head.appendChild(style);

  var audio = document.createElement("audio");
  audio.src = "media/bgm.mp3";
  audio.loop = true;
  audio.preload = "auto";
  audio.autoplay = true;
  audio.volume = TARGET;
  audio.setAttribute("playsinline", "");
  audio.setAttribute("autoplay", "");

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bgm-btn";

  var userStopped = sessionStorage.getItem(KEY) === "1";
  var ducked = false;
  var fadeToken = 0;
  var resumeTimer = 0;
  var videos = [];
  var waitingGesture = false;

  function label() {
    var off = userStopped || (audio.paused && !ducked);
    btn.textContent = off ? "播放" : "停止播放";
    btn.setAttribute("aria-pressed", off ? "false" : "true");
  }

  function videoPlaying() {
    return videos.some(function (v) {
      return !v.paused && !v.ended;
    });
  }

  function cancelFade() {
    fadeToken += 1;
  }

  function cancelResume() {
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = 0;
    }
  }

  function fadeTo(vol, ms, done) {
    cancelFade();
    var token = fadeToken;
    var from = audio.volume;
    if (ms <= 16) {
      audio.volume = vol;
      if (done) done();
      return;
    }
    var start = performance.now();
    function step(now) {
      if (token !== fadeToken) return;
      var t = Math.min(1, (now - start) / ms);
      audio.volume = from + (vol - from) * t;
      if (t < 1) requestAnimationFrame(step);
      else {
        audio.volume = vol;
        if (done) done();
      }
    }
    requestAnimationFrame(step);
  }

  function playThen(fn, onFail) {
    var p = audio.play();
    if (p && p.then) {
      p.then(fn).catch(function () {
        if (onFail) onFail();
        else label();
      });
      return;
    }
    fn();
  }

  function onFirstGesture(e) {
    if (userStopped || !audio.paused) return;
    if (e.target && e.target.closest && e.target.closest(".bgm-btn")) return;
    disarmGesture();
    playUser();
  }

  function armGesture() {
    if (waitingGesture || userStopped) return;
    waitingGesture = true;
    document.addEventListener("pointerdown", onFirstGesture, true);
    document.addEventListener("keydown", onFirstGesture, true);
  }

  function disarmGesture() {
    if (!waitingGesture) return;
    waitingGesture = false;
    document.removeEventListener("pointerdown", onFirstGesture, true);
    document.removeEventListener("keydown", onFirstGesture, true);
  }

  function duckForVideo() {
    if (userStopped) return;
    cancelResume();
    if (ducked && audio.volume <= 0.02) {
      label();
      return;
    }
    ducked = true;
    label();
    fadeTo(0, FADE_OUT_MS, function () {
      if (!ducked || userStopped) return;
      audio.pause();
      label();
    });
  }

  function unduck() {
    resumeTimer = 0;
    if (userStopped || videoPlaying()) return;
    ducked = false;
    audio.volume = 0;
    playThen(function () {
      if (userStopped || videoPlaying() || ducked) return;
      fadeTo(TARGET, FADE_IN_MS, label);
      label();
    }, armGesture);
    label();
  }

  function scheduleUnduck() {
    if (userStopped || videoPlaying()) return;
    cancelResume();
    resumeTimer = setTimeout(unduck, RESUME_DELAY_MS);
  }

  function keepDuckedThroughStall() {
    if (userStopped) return;
    cancelResume();
  }

  function playUser() {
    userStopped = false;
    ducked = false;
    sessionStorage.removeItem(KEY);
    cancelResume();
    disarmGesture();
    audio.volume = 0;
    playThen(function () {
      if (userStopped) return;
      fadeTo(TARGET, FADE_IN_MS, label);
      label();
    }, armGesture);
    label();
  }

  function stopUser() {
    userStopped = true;
    ducked = false;
    sessionStorage.setItem(KEY, "1");
    cancelResume();
    disarmGesture();
    fadeTo(0, 280, function () {
      if (!userStopped) return;
      audio.pause();
      audio.currentTime = 0;
      audio.volume = TARGET;
      label();
    });
    label();
  }

  btn.addEventListener("click", function () {
    if (userStopped || (audio.paused && !ducked)) playUser();
    else stopUser();
  });

  audio.addEventListener("play", function () {
    disarmGesture();
    label();
  });
  audio.addEventListener("pause", label);

  videos = Array.prototype.slice.call(document.querySelectorAll("video"));
  videos.forEach(function (video) {
    video.addEventListener("play", duckForVideo);
    video.addEventListener("waiting", keepDuckedThroughStall);
    video.addEventListener("stalled", keepDuckedThroughStall);
    video.addEventListener("seeking", keepDuckedThroughStall);
    video.addEventListener("playing", function () {
      if (!video.paused && !video.ended) keepDuckedThroughStall();
    });
    video.addEventListener("pause", function () {
      if (video.seeking || !video.paused) return;
      scheduleUnduck();
    });
    video.addEventListener("ended", scheduleUnduck);
  });

  document.body.appendChild(audio);
  document.body.appendChild(btn);
  label();
  if (userStopped) {
    audio.pause();
    label();
  } else {
    playUser();
    audio.addEventListener("canplay", function onReady() {
      audio.removeEventListener("canplay", onReady);
      if (!userStopped && audio.paused) playUser();
    });
  }
})();
