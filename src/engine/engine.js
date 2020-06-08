import * as ROT from 'rot-js';
import {addInputListeners} from '../ui/addInputListeners';
import {constants} from '../lib/constants';
import Actor from '../entity/actor/actor';
import {colors} from '../ui/colors';
import {renderMap} from '../ui/renderMap';
import Level from '../level/level';
import {setRNGSeed} from '../lib/randomUtil';
import {initFovComputer, computeFov} from '../lib/fov';
import {getBlockingActorAtTile} from '../level/level';
import {EngineModes} from './engineModes';
import Combat from '../entity/actor/components/combat';
import {killPlayer, killActor} from '../entity/actor/killActor';

export default class Engine {
  constructor() {
    // init and log rot.js random number generator seed for debugging
    setRNGSeed();

    this.mapDisplay = new ROT.Display({
      width: constants.MAP_WIDTH,
      height: constants.MAP_HEIGHT,
      fontFamily: 'metrickal, monospace',
    }); 
    document.querySelector('#root').appendChild(this.mapDisplay.getContainer());

    // create player
    const combat = new Combat(30, 2, 5);
    this.player = new Actor('Player', 0, 0, '@', colors.WHITE, { combat });
    
    this.entities = [this.player];

    this.level = new Level(constants.MAP_WIDTH, constants.MAP_HEIGHT);
    this.level.generate(this.player, this.entities);

    this.fov = {};
    this.fov.radius = 10;
    initFovComputer(this.level);
    this.fov.map = computeFov(this.player.x, this.player.y, this.fov.radius);
    this.fov.needsRecompute = true;

    this.engineMode = EngineModes.PLAYER_TURN;

    this.addInputListeners = addInputListeners.bind(this);
    this.addInputListeners();

    this.update();
  }

  update(action = {}) { 
    let playerTurnResults = [];

    // Player takes their turn, and a list of turn results is aggregated.
    if( 'PLAYER_MOVE' in action && EngineModes.PLAYER_TURN === this.engineMode ) {
      const dx = action.PLAYER_MOVE[0];
      const dy = action.PLAYER_MOVE[1];
      const destinationX = this.player.x + dx;
      const destinationY = this.player.y + dy;

      if(! this.level.blocksMoveAt(destinationX, destinationY) ) {
        const target = getBlockingActorAtTile(this.entities, destinationX, destinationY);
        if( target ) {
          const attackResults = this.player.combat.attack(target)
          playerTurnResults = [ ...playerTurnResults, ...attackResults ];
        } else {
          this.player.move(dx, dy);
          this.fov.needsRecompute = true;
        }

        this.engineMode = EngineModes.ENEMY_TURN;
      }
    }

    // Handle player turn results
    for( const turnResult of playerTurnResults ) {
      let message = turnResult.message;
      const deadActor = turnResult.dead;

      if( message ) {
        console.log(message);
      }
      if( deadActor ) {
        if( deadActor === this.player ) {
          [message, this.engineMode] = killPlayer(deadActor);
        
        } else {
          message = killActor(deadActor);
        } 
        console.log(message);
      }
    }

    // Loop through all the enemies on the current level, allowing them to act on their turn.
    if( EngineModes.ENEMY_TURN === this.engineMode ) {
      const enemies = this.entities.filter( e => e instanceof Actor && e !== this.player );
      for( const enemy of enemies ) {
        if( enemy.ai ) {
          // Every enemy builds up their own list of turn results.
          const enemyTurnResults = enemy.ai.takeTurn(this.player, this.fov.map, this.level, this.entities);
          
          for( const turnResult of enemyTurnResults ) {
            let message = turnResult.message;
            const deadActor = turnResult.dead;

            if( message ) {
              console.log(message);
            }
            if( deadActor ) {
              if( deadActor === this.player ) {
                [message, this.engineMode] = killPlayer(deadActor);
                break;

              } else {
                message = killActor(deadActor);
              } 
              console.log(message);
            }
          }
        }
        // If the player died on this enemy's turn, don't run any more enemy turns.
        if( EngineModes.PLAYER_DEAD === this.engineMode ) {
          break;
        }        
      }
      if(! (EngineModes.PLAYER_DEAD === this.engineMode) ) {
        this.engineMode = EngineModes.PLAYER_TURN;
      }
    }

    if( this.fov.needsRecompute ) {
      this.fov.map = computeFov( this.player.x, this.player.y, this.fov.radius );
    }

    renderMap(this.mapDisplay, this.level, this.entities, this.fov.map);
    
    this.fov.needsRecompute = false;
  }
}