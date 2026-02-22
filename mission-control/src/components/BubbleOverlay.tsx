import React, { useEffect, useRef } from 'react';
import p5 from 'p5';

const BubbleOverlay: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const sketch = (p: p5) => {
            let bubbles: Bubble[] = [];
            const MAX_BUBBLES = 50;

            p.setup = () => {
                const canvas = p.createCanvas(p.windowWidth, p.windowHeight);
                canvas.style('display', 'block');
                p.noFill();
                p.colorMode(p.RGB, 255);
            };

            p.draw = () => {
                p.clear(0, 0, 0, 0);

                // Spawn bubbles only if mouse moves fast
                const speed = p.dist(p.mouseX, p.mouseY, p.pmouseX, p.pmouseY);
                if (speed > 15 && bubbles.length < MAX_BUBBLES) {
                    bubbles.push(new Bubble(p, p.mouseX, p.mouseY));
                }

                for (let i = bubbles.length - 1; i >= 0; i--) {
                    bubbles[i].update();
                    bubbles[i].display();
                    if (bubbles[i].isDead()) {
                        bubbles.splice(i, 1);
                    }
                }
            };

            p.windowResized = () => {
                p.resizeCanvas(p.windowWidth, p.windowHeight);
            };

            class Bubble {
                p: p5;
                x: number;
                y: number;
                size: number;
                speed: number;
                wobble: number;
                alpha: number;

                constructor(p: p5, x: number, y: number) {
                    this.p = p;
                    this.x = x + p.random(-5, 5);
                    this.y = y + p.random(-5, 5);
                    this.size = p.random(2, 8); // Smaller bubbles
                    this.speed = p.random(0.5, 2.0);
                    this.wobble = p.random(0, 100);
                    this.alpha = 200; // Start bright
                }

                update() {
                    this.y -= this.speed;
                    this.x += p.sin(this.wobble + p.frameCount * 0.1) * 0.3;
                    this.alpha -= 8; // Fade quickly
                }

                display() {
                    const col = this.p.color(147, 197, 253, this.alpha);
                    this.p.stroke(col);
                    this.p.strokeWeight(1.5);
                    this.p.circle(this.x, this.y, this.size);

                    // Shine highlight
                    this.p.stroke(255, 255, 255, this.alpha * 0.7);
                    this.p.arc(this.x, this.y, this.size * 0.7, this.size * 0.7, p.PI + p.QUARTER_PI, p.TWO_PI);
                }

                isDead() {
                    return this.alpha <= 0 || this.y < -20;
                }
            }
        };

        const p5Instance = new p5(sketch, containerRef.current);

        return () => {
            p5Instance.remove();
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-10 pointer-events-none opacity-60 mix-blend-screen"
            aria-hidden="true"
        />
    );
};

export default BubbleOverlay;
