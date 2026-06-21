execute unless score @s creakingheart_timer matches -2147483648..2147483647 store result score @s creakingheart_timer run random value 40..100

scoreboard players remove @s creakingheart_timer 1

execute if score @s creakingheart_timer matches ..0 run playsound minecraft:block.creaking_heart.idle block @a ~ ~ ~ 1 1

execute if score @s creakingheart_timer matches ..0 store result score @s creakingheart_timer run random value 40..100