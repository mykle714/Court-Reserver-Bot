cd /home/Court-Reserver-Bot/court-reserve-bot
git pull origin master
docker-compose down
docker-compose build --no-cache
docker-compose up -d
docker-compose logs --tail=100 bot
