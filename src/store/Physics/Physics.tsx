import * as React from "react";
import { Engine, World, Bodies, Events, Body, Runner } from "matter-js";
import { useGame } from "../Game";
import { useKeyPress } from "../../hooks";
import { Vector } from "../../utils/math";
import { CELL_SIZE, CELL_WIDTH } from "../../settings";
import debounce from "lodash.debounce";
import { GameObjectBody } from "../../sharedTypes";
import { useSound } from "../../assets";
import { sounds } from "../../assets/sounds";

export enum CollisionCategories {
  WALL = 1,
  PLAYER = 2,
  FIRE_BLOCK = 4,
  ICE_BLOCK = 8,
  NEUTRAL_BLOCK = 16,
  PIT_HOLE = 32,
  SHADOW_BLOCK = 64,
  WIN_BLOCK = 128,
  FIRE_PLAYER = 256,
  WATER_PLAYER = 512,
  SHADOW_PLAYER = 1024,
}

type IPhysicsStoreContext = {
  engine?: Engine;
  world?: World;
  subscribeCollision: (
    callback: (
      playerBody: GameObjectBody,
      otherBody: GameObjectBody,
      direction: React.MutableRefObject<Vector>
    ) => void
  ) => void;
  subscribeOnFrame: (
    callback: (event: Matter.IEventTimestamped<Engine>) => void
  ) => void;
  setPlayerPosition: (position: Vector) => void;
};

export const PhysicsStoreContext = React.createContext<IPhysicsStoreContext>({
  engine: undefined,
  world: undefined,
  subscribeCollision: () => {},
  subscribeOnFrame: () => {},
  setPlayerPosition: () => {},
});

export function usePhysics() {
  return React.useContext(PhysicsStoreContext);
}

export function useFrame(
  callback: (event: Matter.IEventTimestamped<Engine>) => void
) {
  const physics = usePhysics();

  physics.subscribeOnFrame(callback);
}

export function PhysicsStore(props: React.PropsWithChildren<{}>) {
  const game = useGame();

  const invert = React.useRef<number>(1);
  const splitted = React.useRef<boolean>(false);

  const [onFrameSubscribers] = React.useState<
    ((event: Matter.IEventTimestamped<Engine>) => void)[]
  >([]);
  const [collisionSubscribers] = React.useState<
    ((playerBody: GameObjectBody, otherBody: GameObjectBody) => void)[]
  >([]);

  const [engine] = React.useState(
    Engine.create({
      gravity: { x: 0, y: 0 },
      enableSleeping: true,
    })
  );
  const world = React.useMemo(() => {
    const world = engine.world;
    return world;
  }, [engine]);

  const runner = React.useMemo(() => {
    const _runner = Runner.create();
    Runner.run(_runner, engine);
    return _runner;
  }, [engine]);

  const player = React.useRef<Body>(
    Bodies.rectangle(350, 350, CELL_SIZE.width, CELL_SIZE.height, {
      mass: 1000,
      frictionAir: 0.2,
      friction: 0,
      restitution: 0,
      plugin: {
        id: "player",
      },
      collisionFilter: {
        category: CollisionCategories.WATER_PLAYER,
        group: -CollisionCategories.PLAYER,
      },
    })
  );
  const player2 = React.useRef<Body>(
    Bodies.rectangle(350, 350, CELL_SIZE.width, CELL_SIZE.height, {
      mass: 1000,
      frictionAir: 0.2,
      friction: 0,
      restitution: 0,
      plugin: {
        id: "player2",
      },
      collisionFilter: {
        category: CollisionCategories.FIRE_PLAYER,
        group: -CollisionCategories.PLAYER,
      },
    })
  );

  const movementSound = useSound("movement");

  const arrowLeft = useKeyPress(["ArrowLeft", "a"], movementSound?.play);
  const arrowRight = useKeyPress(["ArrowRight", "d"], movementSound?.play);
  const arrowUp = useKeyPress(["ArrowUp", "w"], movementSound?.play);
  const arrowDown = useKeyPress(["ArrowDown", "s"], movementSound?.play);
  const spaceKey = useKeyPress([" "]);
  const shiftKey = useKeyPress(["Shift"]);

  const direction = React.useRef<Vector>(new Vector(0, 0));

  React.useEffect(() => {
    direction.current = new Vector(
      arrowLeft || arrowRight ? -(arrowLeft ? 1 : 0) + (arrowRight ? 1 : 0) : 0,
      arrowLeft || arrowRight ? 0 : -(arrowUp ? 1 : 0) + (arrowDown ? 1 : 0)
    );
  }, [arrowLeft, arrowRight, arrowUp, arrowDown]);

  const updatePlayer = React.useCallback(
    debounce(() => {
      const primary = invert.current === 1 ? player.current : player2.current;
      const secondary =
        invert.current === -1 ? player.current : player2.current;

      if (splitted.current) {
        const d = Math.abs(secondary.position.x - primary.position.x);
        const sign = Math.sign(secondary.position.x - primary.position.x);

        if (d > CELL_WIDTH || sign === invert.current)
          Body.applyForce(primary, primary.position, {
            x: direction.current.x * 75,
            y: direction.current.y * 75,
          });
        if (d > CELL_WIDTH)
          Body.applyForce(secondary, secondary.position, {
            x: -direction.current.x * 75,
            y: direction.current.y * 75,
          });
      } else {
        Body.applyForce(primary, primary.position, {
          x: direction.current.x * 75,
          y: direction.current.y * 75,
        });
      }
    }, 0),
    []
  );

  React.useEffect(() => {
    invert.current = game.player?.active === "left" ? 1 : -1;
    splitted.current = game.player?.isSplited || false;
  }, [game.player?.active, game.player?.isSplited]);

  React.useEffect(() => {
    if (shiftKey) {
      game.changePlayerSide();
      if(game.player?.isSplited){
        sounds.select.play();
      }
    }
  }, [game.player?.isSplited, shiftKey]);

  React.useEffect(() => {
    if (spaceKey)
      if (!game.player?.isSplited) {
        Body.setPosition(player2.current, player.current.position);
        sounds.split.play();
        Body.applyForce(player.current, player.current.position, {
          x: -1 * 75,
          y: 0,
        });
        Body.applyForce(player2.current, player2.current.position, {
          x: 1 * 75,
          y: 0,
        });

        game.changePlayer((player) =>
          player ? { ...player, isSplited: true } : player
        );
      }
  }, [game.player?.isSplited, spaceKey]);

  React.useEffect(() => {
    World.add(world, player.current);
    World.add(world, player2.current);

    let tsStart = 0;

    Events.on(engine, "afterUpdate", function (event) {
      if (direction.current.x || direction.current.y) {
        if (event.timestamp - tsStart > 380) {
          tsStart = event.timestamp;
          updatePlayer();
        }
      }

      if (!splitted.current) {
        player.current.collisionFilter.category = CollisionCategories.PLAYER;
        player2.current.collisionFilter.category = CollisionCategories.PLAYER;
      } else {
        player.current.collisionFilter.category =
          CollisionCategories.WATER_PLAYER;
        player2.current.collisionFilter.category =
          CollisionCategories.FIRE_PLAYER;
      }

      if (player.current.speed === 0) {
        Body.setPosition(player.current, {
          x:
            Math.trunc(Math.round((player.current.position.x - 50) / 100)) *
              100 +
            50,
          y:
            Math.trunc(Math.round((player.current.position.y - 50) / 100)) *
              100 +
            50,
        });
      } else if (Math.abs(player.current.speed) <= 1) {
        Body.setVelocity(player.current, { x: 0, y: 0 });
      }

      if (player2.current.speed === 0) {
        Body.setPosition(player2.current, {
          x:
            Math.trunc(Math.round((player2.current.position.x - 50) / 100)) *
              100 +
            50,
          y:
            Math.trunc(Math.round((player2.current.position.y - 50) / 100)) *
              100 +
            50,
        });
      } else if (Math.abs(player2.current.speed) <= 1) {
        Body.setVelocity(player2.current, { x: 0, y: 0 });
      }

      if (player2.current.speed === 0 && player.current.speed === 0) {
        if (
          player2.current.position.x - player.current.position.x <
          CELL_WIDTH / 2
        )
          game.changePlayer((player) =>
            player ? { ...player, isSplited: false, active: "left" } : player
          );
      }

      onFrameSubscribers.forEach((cb) => {
        if (cb) cb(event);
      });
    });

    Events.on(engine, "collisionStart", (e) => {
      e.pairs.forEach(({ bodyA, bodyB }) => {
        collisionSubscribers.forEach((cb) => {
          if (cb) {
            const player = (bodyA.plugin.id === "player"
              ? bodyA
              : bodyB) as unknown as GameObjectBody;
            const other = (bodyA.plugin.id === "player"
              ? bodyB
              : bodyA) as unknown as GameObjectBody;
            cb(player, other);
          }
        });
      });
    });
  }, [engine]);

  const subscribeCollision = (
    cb: (
      playerBody: GameObjectBody,
      otherBody: GameObjectBody,
      direction: React.MutableRefObject<Vector>
    ) => void
  ) => {
    collisionSubscribers.push(
      debounce((playerBody: GameObjectBody, otherBody: GameObjectBody) => {
        cb(playerBody, otherBody, direction);
      }, 10)
    );
  };

  const subscribeOnFrame = (
    cb: (event: Matter.IEventTimestamped<Engine>) => void
  ) => {
    onFrameSubscribers.push(cb);
  };

  const setPlayerPosition = React.useCallback((position: Vector) => {
    Body.setPosition(player.current, position);
  }, []);

  const contextValue = {
    engine,
    world,
    subscribeCollision,
    subscribeOnFrame,
    setPlayerPosition,
  };

  return (
    <PhysicsStoreContext.Provider value={contextValue}>
      {props.children}
    </PhysicsStoreContext.Provider>
  );
}
