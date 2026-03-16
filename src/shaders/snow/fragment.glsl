varying float vHeight;

void main() {
    float particle = smoothstep(0.5, 1.0, 1.0 - distance(gl_PointCoord, vec2(0.5)));
    float fade = smoothstep(0.02, 0.12, vHeight);
    gl_FragColor = vec4(1.0, 1.0, 1.0, particle * fade);
}