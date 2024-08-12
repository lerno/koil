import * as common from './common.mjs';
import { Vector2 } from './vector.mjs';
const DIRECTION_KEYS = {
    'ArrowLeft': common.Moving.TurningLeft,
    'ArrowRight': common.Moving.TurningRight,
    'ArrowUp': common.Moving.MovingForward,
    'ArrowDown': common.Moving.MovingBackward,
    'KeyA': common.Moving.TurningLeft,
    'KeyD': common.Moving.TurningRight,
    'KeyW': common.Moving.MovingForward,
    'KeyS': common.Moving.MovingBackward,
};
function strokeLine(ctx, p1, p2) {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
}
(async () => {
    const gameCanvas = document.getElementById('game');
    if (gameCanvas === null)
        throw new Error('No element with id `game`');
    gameCanvas.width = common.WORLD_WIDTH;
    gameCanvas.height = common.WORLD_HEIGHT;
    const ctx = gameCanvas.getContext("2d");
    if (ctx === null)
        throw new Error('2d canvas is not supported');
    let ws = new WebSocket(`ws://${window.location.hostname}:${common.SERVER_PORT}`);
    let me = undefined;
    const players = new Map();
    let ping = 0;
    ws.binaryType = 'arraybuffer';
    ws.addEventListener("close", (event) => {
        console.log("WEBSOCKET CLOSE", event);
        ws = undefined;
    });
    ws.addEventListener("error", (event) => {
        console.log("WEBSOCKET ERROR", event);
    });
    ws.addEventListener("message", (event) => {
        if (!(event.data instanceof ArrayBuffer)) {
            console.error("Received bogus-amogus message from server. Expected binary data", event);
            ws?.close();
        }
        const view = new DataView(event.data);
        if (me === undefined) {
            if (common.HelloStruct.verify(view)) {
                me = {
                    id: common.HelloStruct.id.read(view),
                    position: new Vector2(common.HelloStruct.x_.read(view), common.HelloStruct.y_.read(view)),
                    direction: common.HelloStruct.direction.read(view),
                    moving: 0,
                    hue: common.HelloStruct.hue.read(view) / 256 * 360,
                };
                players.set(me.id, me);
            }
            else {
                console.error("Received bogus-amogus message from server. Incorrect `Hello` message.", view);
                ws?.close();
            }
        }
        else {
            if (common.PlayersJoinedHeaderStruct.verify(view)) {
                const count = common.PlayersJoinedHeaderStruct.count(view);
                for (let i = 0; i < count; ++i) {
                    const playerView = new DataView(event.data, common.PlayersJoinedHeaderStruct.size + i * common.PlayerStruct.size, common.PlayerStruct.size);
                    const id = common.PlayerStruct.id.read(playerView);
                    const player = players.get(id);
                    if (player !== undefined) {
                        player.position.x = common.PlayerStruct.x_.read(playerView);
                        player.position.y = common.PlayerStruct.y_.read(playerView);
                        player.direction = common.PlayerStruct.direction.read(playerView);
                        player.moving = common.PlayerStruct.moving.read(playerView);
                        player.hue = common.PlayerStruct.hue.read(playerView) / 256 * 360;
                    }
                    else {
                        const x = common.PlayerStruct.x_.read(playerView);
                        const y = common.PlayerStruct.y_.read(playerView);
                        players.set(id, {
                            id,
                            position: new Vector2(x, y),
                            direction: common.PlayerStruct.direction.read(playerView),
                            moving: common.PlayerStruct.moving.read(playerView),
                            hue: common.PlayerStruct.hue.read(playerView) / 256 * 360,
                        });
                    }
                }
            }
            else if (common.PlayersLeftHeaderStruct.verify(view)) {
                const count = common.PlayersLeftHeaderStruct.count(view);
                for (let i = 0; i < count; ++i) {
                    const id = common.PlayersLeftHeaderStruct.items(i).id.read(view);
                    players.delete(id);
                }
            }
            else if (common.PlayersMovingHeaderStruct.verify(view)) {
                const count = common.PlayersMovingHeaderStruct.count(view);
                for (let i = 0; i < count; ++i) {
                    const playerView = new DataView(event.data, common.PlayersMovingHeaderStruct.size + i * common.PlayerStruct.size, common.PlayerStruct.size);
                    const id = common.PlayerStruct.id.read(playerView);
                    const player = players.get(id);
                    if (player === undefined) {
                        console.error(`Received bogus-amogus message from server. We don't know anything about player with id ${id}`);
                        ws?.close();
                        return;
                    }
                    player.moving = common.PlayerStruct.moving.read(playerView);
                    player.position.x = common.PlayerStruct.x_.read(playerView);
                    player.position.y = common.PlayerStruct.y_.read(playerView);
                    player.direction = common.PlayerStruct.direction.read(playerView);
                }
            }
            else if (common.PongStruct.verify(view)) {
                ping = performance.now() - common.PongStruct.timestamp.read(view);
            }
            else {
                console.error("Received bogus-amogus message from server.", view);
                ws?.close();
            }
        }
    });
    ws.addEventListener("open", (event) => {
        console.log("WEBSOCKET OPEN", event);
    });
    const PING_COOLDOWN = 60;
    let previousTimestamp = 0;
    let pingCooldown = PING_COOLDOWN;
    const frame = (timestamp) => {
        const deltaTime = (timestamp - previousTimestamp) / 1000;
        previousTimestamp = timestamp;
        ctx.fillStyle = '#202020';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (ws === undefined) {
            const label = "Disconnected";
            const size = ctx.measureText(label);
            ctx.font = "48px bold";
            ctx.fillStyle = 'white';
            ctx.fillText(label, ctx.canvas.width / 2 - size.width / 2, ctx.canvas.height / 2);
        }
        else {
            players.forEach((player) => {
                if (me !== undefined && me.id !== player.id) {
                    common.updatePlayer(player, common.SCENE, deltaTime);
                    ctx.fillStyle = `hsl(${player.hue} 70% 40%)`;
                    ctx.fillRect(player.position.x, player.position.y, common.PLAYER_SIZE, common.PLAYER_SIZE);
                    ctx.strokeStyle = `hsl(${player.hue} 70% 40%)`;
                    ctx.lineWidth = 4;
                    const center = player.position.clone().add(new Vector2(common.PLAYER_SIZE * 0.5, common.PLAYER_SIZE * 0.5));
                    strokeLine(ctx, center, new Vector2().setPolar(player.direction, common.PLAYER_SIZE * 2).add(center));
                }
            });
            if (me !== undefined) {
                common.updatePlayer(me, common.SCENE, deltaTime);
                ctx.fillStyle = `hsl(${me.hue} 100% 40%)`;
                ctx.fillRect(me.position.x, me.position.y, common.PLAYER_SIZE, common.PLAYER_SIZE);
                ctx.strokeStyle = `hsl(${me.hue} 70% 40%)`;
                ctx.lineWidth = 4;
                const center = me.position.clone().add(new Vector2(common.PLAYER_SIZE * 0.5, common.PLAYER_SIZE * 0.5));
                strokeLine(ctx, center, new Vector2().setPolar(me.direction, common.PLAYER_SIZE * 2).add(center));
                ctx.strokeStyle = "white";
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.strokeRect(me.position.x, me.position.y, common.PLAYER_SIZE, common.PLAYER_SIZE);
                ctx.stroke();
            }
            ctx.font = "18px bold";
            ctx.fillStyle = 'white';
            const padding = ctx.canvas.width * 0.05;
            ctx.fillText(`Ping: ${ping.toFixed(2)}ms`, padding, padding);
            pingCooldown -= 1;
            if (pingCooldown <= 0) {
                const view = new DataView(new ArrayBuffer(common.PingStruct.size));
                common.PingStruct.kind.write(view, common.MessageKind.Ping);
                common.PingStruct.timestamp.write(view, performance.now());
                ws.send(view);
                pingCooldown = PING_COOLDOWN;
            }
        }
        window.requestAnimationFrame(frame);
    };
    window.requestAnimationFrame((timestamp) => {
        previousTimestamp = timestamp;
        window.requestAnimationFrame(frame);
    });
    window.addEventListener("keydown", (e) => {
        if (ws !== undefined && me !== undefined) {
            if (!e.repeat) {
                const direction = DIRECTION_KEYS[e.code];
                if (direction !== undefined) {
                    const view = new DataView(new ArrayBuffer(common.AmmaMovingStruct.size));
                    common.AmmaMovingStruct.kind.write(view, common.MessageKind.AmmaMoving);
                    common.AmmaMovingStruct.start.write(view, 1);
                    common.AmmaMovingStruct.direction.write(view, direction);
                    ws.send(view);
                }
            }
        }
    });
    window.addEventListener("keyup", (e) => {
        if (ws !== undefined && me !== undefined) {
            if (!e.repeat) {
                const direction = DIRECTION_KEYS[e.code];
                if (direction !== undefined) {
                    const view = new DataView(new ArrayBuffer(common.AmmaMovingStruct.size));
                    common.AmmaMovingStruct.kind.write(view, common.MessageKind.AmmaMoving);
                    common.AmmaMovingStruct.start.write(view, 0);
                    common.AmmaMovingStruct.direction.write(view, direction);
                    ws.send(view);
                }
            }
        }
    });
})();
//# sourceMappingURL=client.mjs.map