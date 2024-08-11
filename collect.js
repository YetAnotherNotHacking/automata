const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const Vec3 = require('vec3');

const BOT_USERNAME = '-----------------@gmail.com'; // your username or email
const SERVER_HOST = '---------.--'; //server
const SERVER_PORT = ------; //server port
const AUTH_TYPE = 'microsoft'; //use offile for cracked servers

const TRUSTED_USERS = ['ProbNotHacking', 'ProbNotAlting']; //users to accept whisper commands from
const ITEMS_TO_DISCARD = ['netherrack', 'cobblestone']; //blocks that might fill up the inventory 
const COLLECTION_RADIUS = 32; // how far can it explre?

function createBot() {
  const bot = mineflayer.createBot({
    host: SERVER_HOST,
    port: SERVER_PORT,
    username: BOT_USERNAME,
    auth: AUTH_TYPE,
  });

  bot.loadPlugin(pathfinder);

  // login
  bot.once('spawn', () => {
    console.log('Bot has spawned and is ready to receive commands.');
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    bot.pathfinder.setMovements(defaultMove);
  });

  // disconnections
  bot.on('error', (err) => console.log('Error:', err));
  bot.on('end', () => {
    console.log('Bot has disconnected. Attempting to reconnect in 5 seconds...');
    setTimeout(createBot, 5000);
  });

  bot.on('whisper', (username, message) => {
    if (TRUSTED_USERS.includes(username)) {
      const [command, ...args] = message.toLowerCase().split(' ');
      switch(command) {
        case 'collect':
          const [item, amount] = args;
          console.log(`Received request from ${username} to collect ${amount} ${item}`);
          bot.whisper(username, `Starting collection of ${amount} ${item}.`);
          collectItems(bot, username, item, parseInt(amount), bot.entity.position.clone());
          break;
        case 'inventory':
          sendInventory(bot, username);
          break;
        default:
          bot.whisper(username, 'Unknown command. Available commands: collect, inventory');
      }
    }
  });

  return bot;
}

function sendInventory(bot, username) {
  const inventory = bot.inventory.items();
  if (inventory.length === 0) {
    bot.whisper(username, 'My inventory is empty.');
  } else {
    const itemCounts = inventory.reduce((acc, item) => {
      acc[item.name] = (acc[item.name] || 0) + item.count;
      return acc;
    }, {});
    
    const inventoryList = Object.entries(itemCounts)
      .map(([name, count]) => `${name}: ${count}`)
      .join(', ');
    
    bot.whisper(username, `My inventory contains: ${inventoryList}`);
  }
}

async function collectItems(bot, requester, itemName, amount, originalPosition) {
  const mcData = require('minecraft-data')(bot.version);
  const itemsByName = mcData.itemsByName;
  const item = itemsByName[itemName];

  if (!item) {
    console.log(`Unknown item: ${itemName}`);
    bot.whisper(requester, `Unknown item: ${itemName}`);
    return;
  }

  let collectedCount = 0;
  const startTime = Date.now();
  let dropChest = null;

  while (collectedCount < amount) {
    if (Date.now() - startTime > 300000) { // 5 min. timeout
      console.log('Collection timed out. Returning to original position.');
      bot.whisper(requester, 'Collection timed out. Returning to original position.');
      break;
    }

    const entity = bot.nearestEntity(entity => {
      return entity.name === 'item' && 
             entity.position.distanceTo(bot.entity.position) < COLLECTION_RADIUS &&
             bot.entity.position.distanceTo(entity.position) > 1; // do not pick up the items it just threw out
    });

    if (entity) {
      const { x, y, z } = entity.position;
      await bot.pathfinder.goto(new goals.GoalNear(x, y, z, 1));

      // ensure that it pick up items
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (bot.inventory.items().some(i => i.name === itemName)) {
        collectedCount++;
        console.log(`Collected ${collectedCount}/${amount} ${itemName}`);
        
        // send updates to person that ordered the items
        if (collectedCount % 10 === 0 || collectedCount === amount) {
          bot.whisper(requester, `Collected ${collectedCount}/${amount} ${itemName}`);
        }

        // get rid of unwanted items as defined at the top of the script
        for (const itemToDiscard of ITEMS_TO_DISCARD) {
          const discardItem = bot.inventory.items().find(i => i.name === itemToDiscard);
          if (discardItem) {
            await bot.toss(discardItem.type, null, discardItem.count);
            console.log(`Discarded ${discardItem.count} ${itemToDiscard}`);
          }
        }

        // place a chest when the inventory is full, will depricate
        if (bot.inventory.emptySlotCount() === 0 && !dropChest) {
          dropChest = await placeChest(bot, originalPosition);
          if (dropChest) {
            bot.whisper(requester, `Placed a chest at ${dropChest.position.x}, ${dropChest.position.y}, ${dropChest.position.z} for item storage.`);
          }
        }

        // put the thing in the chest if the chest is a chest
        if (dropChest && bot.inventory.emptySlotCount() < 5) {
          await depositItems(bot, dropChest, itemName);
        }
      }
    } else {
      console.log(`No ${itemName} found nearby. Moving to a new area.`);
      bot.whisper(requester, `No ${itemName} found nearby. Moving to a new area.`);
      const randomDirection = new Vec3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
      const newPosition = bot.entity.position.plus(randomDirection.scaled(10));
      await bot.pathfinder.goto(new goals.GoalNear(newPosition.x, newPosition.y, newPosition.z, 1));
    }

    // scawy mobs
    const nearestMob = bot.nearestEntity(entity => entity.type === 'mob');
    if (nearestMob && nearestMob.position.distanceTo(bot.entity.position) < 5) {
      console.log('Avoiding nearby mob');
      const escapeDirection = bot.entity.position.minus(nearestMob.position).normalize();
      const escapePosition = bot.entity.position.plus(escapeDirection.scaled(10));
      await bot.pathfinder.goto(new goals.GoalNear(escapePosition.x, escapePosition.y, escapePosition.z, 1));
    }
  }

  console.log(`Collection complete. Returning to original position.`);
  bot.whisper(requester, `Collection complete. Returning to original position.`);
  await bot.pathfinder.goto(new goals.GoalNear(originalPosition.x, originalPosition.y, originalPosition.z, 1));
  console.log('Returned to original position. Task complete.');
  
  if (dropChest) {
    bot.whisper(requester, `Task complete. Collected items are stored in a chest at ${dropChest.position.x}, ${dropChest.position.y}, ${dropChest.position.z}.`);
  } else {
    bot.whisper(requester, `Task complete. Collected items are in my inventory. You can collect them from me at ${bot.entity.position.x.toFixed(0)}, ${bot.entity.position.y.toFixed(0)}, ${bot.entity.position.z.toFixed(0)}.`);
  }
}

async function placeChest(bot, nearPosition) {
  const chestItem = bot.inventory.items().find(item => item.name === 'chest');
  if (!chestItem) {
    console.log('No chest in inventory to place.');
    return null;
  }

  const chestPosition = nearPosition.offset(1, 0, 0);
  try {
    await bot.equip(chestItem, 'hand');
    await bot.placeBlock(bot.blockAt(chestPosition), new Vec3(0, 1, 0));
    return bot.blockAt(chestPosition);
  } catch (err) {
    console.log('Failed to place chest:', err);
    return null;
  }
}

async function depositItems(bot, chest, itemName) {
  const chestWindow = await bot.openChest(chest);
  const itemsToDeposit = bot.inventory.items().filter(item => item.name === itemName);
  for (const item of itemsToDeposit) {
    await chestWindow.deposit(item.type, null, item.count);
  }
  await chestWindow.close();
}

console.log('Bot script started. Attempting to connect to the server...');
createBot();
