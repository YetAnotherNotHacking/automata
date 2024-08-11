import subprocess
import time

def run_minecraft_bots():
    process = subprocess.Popen(['node', 'bot.js'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return process

def make_bots_jump():
    with open('command.txt', 'w') as command_file:
        command_file.write('jump\n')

def main():
    # Start the Minecraft bots
    process = run_minecraft_bots()
    print("Minecraft bots are running...")

    try:
        while True:
            # Command the bots to jump
            make_bots_jump()
            print("Bots are jumping...")
            
            time.sleep(5)  # Wait before sending the command again
    except KeyboardInterrupt:
        print("Stopping bots...")
        process.terminate()
        process.wait()

if __name__ == "__main__":
    main()
