export function createInteractionBlockerOverlay(
  id = 'robbin-da-hood-interaction-blocker',
  message = 'Automated processing in progress. Please wait...',
): void {
  // Put pure functions here
  const eventsToBlock: Array<keyof HTMLElementEventMap> = [
    'mousedown',
    'mouseup',
    'click',
    'dblclick',
    'keydown',
    'keyup',
    'keypress',
    'contextmenu',
    'wheel',
    'scroll',
    'selectstart',
    'dragstart',
    'touchstart',
    'touchend',
    'touchmove',
    'pointerdown',
    'pointerup',
    'pointermove',
  ];

  const stopEventPropagation = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.backgroundColor = 'rgba(0,0,0,0.3)';
  overlay.style.zIndex = '2147483646'; // Highest possible z-index minus one, to be "on top" of most things
  overlay.style.cursor = 'wait';

  for (const eventType of eventsToBlock) {
    overlay.addEventListener(eventType, stopEventPropagation, { capture: true });
  }

  const messageDiv = document.createElement('div');
  messageDiv.textContent = message;
  messageDiv.style.position = 'absolute';
  messageDiv.style.top = '20px';
  messageDiv.style.left = '50%';
  messageDiv.style.transform = 'translateX(-50%)';
  messageDiv.style.padding = '10px 15px';
  messageDiv.style.backgroundColor = 'rgba(255,255,255,0.97)';
  messageDiv.style.border = '1px solid #ccc';
  messageDiv.style.borderRadius = '5px';
  messageDiv.style.color = '#333';
  messageDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
  messageDiv.style.zIndex = '2147483647'; // Higher than the overlay itself
  overlay.appendChild(messageDiv);
  document.body.appendChild(overlay);
}

export function removeInteractionBlockerOverlay(id: string): void {
  const overlay = document.getElementById(id);
  if (overlay) {
    overlay.remove();
  }
}
