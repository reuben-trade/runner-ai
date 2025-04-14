FROM python:3.9-slim

WORKDIR /app

COPY . .

#Trying to install as much dependencies as possible on build so you manually don't have to do it
RUN pip install --no-cache-dir -r requirements.txt

#NOTICE IF YOU ARE HAVING TROUBLE WITH TENSORFLOW PLEASE UNCOMMENT THE LINE BELOW:
#RUN pip install tensorflow

RUN python agent.py download-files

EXPOSE 5000

CMD ["python", "agent.py", "dev"]
