export function createRoundController({ onChange, onExpire }) {
  let round = 1;
  let timerId = null;
  let remaining = 60;
  const timer = document.querySelector('#round-timer');
  const roundNumber = document.querySelector('#round-number');

  function renderTimer() { timer.textContent = `00:${String(remaining).padStart(2, '0')}`; }
  function stopTimer() { window.clearInterval(timerId); timerId = null; }
  function startTimer() {
    stopTimer(); remaining = 60; renderTimer();
    timerId = window.setInterval(() => { remaining -= 1; renderTimer(); if (remaining <= 0) { stopTimer(); onExpire?.(round); } }, 1000);
  }
  function setRound(nextRound) {
    round = nextRound; roundNumber.textContent = round; startTimer(); onChange(round);
  }
  return { start: (nextRound = 1) => setRound(nextRound), stop: stopTimer, getRound: () => round, destroy: stopTimer };
}
