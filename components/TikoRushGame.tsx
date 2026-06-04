'use client';

import { useEffect, useRef, useState } from 'react';

type GameState = 'START' | 'PLAYING' | 'GAME_OVER';

export function TikoRushGame() {
  const [gameState, setGameState] = useState<GameState>('START');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  useEffect(() => {
    if (gameState !== 'PLAYING') {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const resizeCanvas = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;

      canvas.width = Math.max(1, Math.floor(width * pixelRatio));
      canvas.height = Math.max(1, Math.floor(height * pixelRatio));
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const render = (timestamp: number) => {
      const deltaTime = timestamp - lastFrameTimeRef.current;
      lastFrameTimeRef.current = timestamp;

      const { width, height } = canvas.getBoundingClientRect();
      context.clearRect(0, 0, width, height);

      frameRef.current = requestAnimationFrame(render);

      if (deltaTime >= 0) {
        // Placeholder for future game entities, collisions and HUD drawing.
      }
    };

    resizeCanvas();
    lastFrameTimeRef.current = performance.now();
    window.addEventListener('resize', resizeCanvas);
    frameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resizeCanvas);

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [gameState]);

  const startTurn = () => {
    setGameState('PLAYING');
  };

  const finishTurn = () => {
    setGameState('GAME_OVER');
  };

  const resetGame = () => {
    setGameState('START');
  };

  return (
    <main className="game-shell">
      <section className="game-frame">
        <div className="game-grid">
          <aside className="info-panel">
            <p className="eyebrow">Tiko Rush</p>
            <h1 className="title">
              {gameState === 'GAME_OVER' ? 'Turno finalizado' : 'Tiko Rush'}
            </h1>
            <p className="description">
              {gameState === 'START' && 'Prepara la partida y entra al loop principal del juego.'}
              {gameState === 'PLAYING' && 'El canvas está listo para renderizar el juego 2D.'}
              {gameState === 'GAME_OVER' && 'La estructura ya contempla el cierre de turno y el reinicio.'}
            </p>

            {gameState === 'START' && (
              <button
                type="button"
                onClick={startTurn}
                className="primary-button"
              >
                Iniciar Turno
              </button>
            )}

            {gameState === 'PLAYING' && (
              <div className="actions-row">
                <button
                  type="button"
                  onClick={finishTurn}
                  className="secondary-button"
                >
                  Terminar turno
                </button>
              </div>
            )}

            {gameState === 'GAME_OVER' && (
              <button
                type="button"
                onClick={resetGame}
                className="primary-button"
              >
                Volver a empezar
              </button>
            )}
          </aside>

          <section className="game-panel">
            <div className="status-bar">
              <span>Estado: {gameState}</span>
              <span>Canvas 2D</span>
            </div>

            <div className="stage-wrap">
              {gameState === 'PLAYING' ? (
                <canvas
                  ref={canvasRef}
                  className="game-canvas"
                />
              ) : (
                <div className="empty-state">
                  <div>
                    <p className="empty-kicker">
                      {gameState === 'START' ? 'Pantalla inicial' : 'Estado de derrota'}
                    </p>
                    <p className="empty-copy">
                      {gameState === 'START'
                        ? 'El canvas se activará cuando comience el turno.'
                        : 'Aquí puedes mostrar el resumen del turno y las estadísticas finales.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
