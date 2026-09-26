export function createRoundController({ onChange, onExpire, onTick }) {
  let round = 1;
  let timerId = null;
  let remaining = 60;
  const timer = document.querySelector('#round-timer');
  const roundNumber = document.querySelector('#round-number');

  function renderTimer() { timer.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`; }
  function stopTimer() { window.clearInterval(timerId); timerId = null; }
  function startTimer() {
    stopTimer();
    onTick?.(round, remaining);
    timerId = window.setInterval(() => { remaining -= 1; renderTimer(); onTick?.(round, remaining); if (remaining <= 0) { stopTimer(); onExpire?.(round); } }, 1000);
  }
  function setRound(nextRound) {
    stopTimer(); round = nextRound; remaining = 60; roundNumber.textContent = round; renderTimer(); onChange(round); startTimer();
  }
  return { start: (nextRound = 1) => setRound(nextRound), stop: stopTimer, getRound: () => round, getRemaining: () => remaining, destroy: stopTimer };
}
