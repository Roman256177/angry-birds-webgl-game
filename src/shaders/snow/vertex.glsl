uniform float uTime;
attribute float aSpeed;
attribute float aWind;
attribute float aSize;
varying float vHeight;

void main() {
    vec3 pos = position;
    pos.y = mod(position.y - uTime * aSpeed, 100.0);
    float wind = uTime + aWind;
    pos.x += sin(wind) * 1.5;
    pos.z += cos(wind) * 1.5;
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;
    gl_PointSize = aSize * (300.0 / -mvPos.z);
    vHeight = pos.y / 100.0;
}