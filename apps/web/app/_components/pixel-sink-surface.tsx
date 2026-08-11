"use client";

import { useEffect, useRef } from "react";

const vertexShader = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;
uniform float u_active;
uniform float u_dpr;

float box(vec2 point, float radius, float softness) {
  float distanceToEdge = max(abs(point.x), abs(point.y));
  return 1.0 - smoothstep(radius, radius + softness, distanceToEdge);
}

void main() {
  vec2 pixel = gl_FragCoord.xy;
  float spacing = 17.0 * u_dpr;
  vec2 cell = floor(pixel / spacing);
  vec2 center = (cell + 0.5) * spacing;
  float distanceToMouse = distance(center, u_mouse);
  float radius = 138.0 * u_dpr;
  float depression = exp(-2.7 * pow(distanceToMouse / radius, 2.0)) * u_active;
  float ripple = (0.5 + 0.5 * sin(distanceToMouse * 0.085 / u_dpr - u_time * 0.0045))
    * smoothstep(radius, radius * 0.18, distanceToMouse)
    * 0.2
    * u_active;
  float depth = clamp(depression + ripple, 0.0, 1.0);

  vec2 local = pixel - center;
  float pinRadius = mix(0.85, 2.6, depth) * u_dpr;
  float pin = box(local, pinRadius, 0.75 * u_dpr);
  float innerShadow = box(local + vec2(1.2, -1.2) * u_dpr * depth, pinRadius + 1.25 * u_dpr, 1.1 * u_dpr) - pin;
  float well = smoothstep(radius, 0.0, distanceToMouse) * 0.022 * u_active;

  vec3 navy = vec3(0.039, 0.129, 0.231);
  vec3 green = vec3(0.039, 0.353, 0.263);
  vec3 color = mix(navy, green, depth * 0.72);
  float alpha = pin * mix(0.022, 0.17, depth) + innerShadow * 0.045 * depth + well;

  gl_FragColor = vec4(color, alpha);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function PixelSinkSurface() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarsePointer = window.matchMedia("(pointer: coarse)");
    if (reducedMotion.matches || coarsePointer.matches) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: true
    });
    if (!gl) return;

    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShader);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
    if (!vertex || !fragment) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );

    gl.useProgram(program);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const resolutionUniform = gl.getUniformLocation(program, "u_resolution");
    const mouseUniform = gl.getUniformLocation(program, "u_mouse");
    const timeUniform = gl.getUniformLocation(program, "u_time");
    const activeUniform = gl.getUniformLocation(program, "u_active");
    const dprUniform = gl.getUniformLocation(program, "u_dpr");

    let frame = 0;
    let active = 0;
    let targetActive = 0;
    let mouseX = -1000;
    let mouseY = -1000;
    let targetX = -1000;
    let targetY = -1000;
    let dpr = 1;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
      schedule();
    };

    const render = (time: number) => {
      frame = 0;
      mouseX += (targetX - mouseX) * 0.14;
      mouseY += (targetY - mouseY) * 0.14;
      active += (targetActive - active) * 0.09;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(resolutionUniform, canvas.width, canvas.height);
      gl.uniform2f(mouseUniform, mouseX, mouseY);
      gl.uniform1f(timeUniform, time);
      gl.uniform1f(activeUniform, active);
      gl.uniform1f(dprUniform, dpr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const moving = Math.abs(targetX - mouseX) + Math.abs(targetY - mouseY) > 0.3;
      if (moving || Math.abs(targetActive - active) > 0.006) schedule();
    };

    const schedule = () => {
      if (!frame && document.visibilityState === "visible") frame = requestAnimationFrame(render);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      targetX = (event.clientX - rect.left) * dpr;
      targetY = (rect.bottom - event.clientY) * dpr;
      if (mouseX < -500) {
        mouseX = targetX;
        mouseY = targetY;
      }
      targetActive = 1;
      schedule();
    };

    const onPointerLeave = () => {
      targetActive = 0;
      schedule();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") schedule();
      else if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    host.addEventListener("pointermove", onPointerMove, { passive: true });
    host.addEventListener("pointerleave", onPointerLeave, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    resize();

    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      observer.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return <canvas ref={canvasRef} className="pixel-sink-canvas" aria-hidden="true" />;
}
