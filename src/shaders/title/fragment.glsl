uniform float uFade;
varying float vY;

void main() {
    float alpha = smoothstep(0.15, 1.0, vY) * uFade;
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
}