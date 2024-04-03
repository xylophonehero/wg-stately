# **Case Study Template **

> Start with a brief exposition about Stately's relationship with the customer. Mention when they started using xState in their business, and provide a brief blurb about their inspiration to share their particular use case and a positive quote from the customer about their experience.

- Using xState means we can ship scalable and reliable software
  - Convert all the events in our frontend (internal and external) into xState events so we can easily manage side effects and show the correct UI.
- Using xState meant that we were able to rebuild the frontend of streaming platform from a monolith Ruby on Rails app to a React app in less than a year.

## **Customer Profile**

> Provide a description of the customer and their current business goals. Talk about the customer's current line of business (i.e. what industry they work in), their current product, the number of users they may have to support, or their current workflow and what it looks like to add new features.

- WebinarGeek is browser based webinar platform that can support up to 5000 viewers watching a webinar at one time.
- WebinarGeek supports live, automated and ondemand webinars which all take place in the browser.
- WebinarGeek is constantly shipping new features and improving existing ones based on customer feedback. As soon as a feature or fix is ready and has reviewed and gone through UAT process, we try to release it as soon as possible.
- Average viewer count is around 63, average length 70 minutes for live webinars
![image](https://github.com/xylophonehero/wg-stately/assets/68996622/be00097a-a8cf-45b4-9d36-39acd4ea1635)

## **Problem Statement**

> Describe the core motivation for seeking out a solution like **xState**. What problems were the customers experiencing before moving to the platform? Focus on at least one of the following categories: collaboration with or among other teams, codebase organization and developer experience, or bug discovery and the ability to ship reliable code faster.

- WebinarGeek used to be a monolith Ruby on Rails application. At the start of covid, the demand for online events grew and we saw a large rise in user base. The legacy platform had limitations: only showing one presenter on stage at a time, difficulties when responding to video player events. The solution was to rebuild the page using React + Rails APIs + Phoenix websockets.
- The streaming page should be able to handle live webinars (happening in real time, possibly with a small delay), automated webinars (pre recorded webinars starting at a set time) and ondemand webinars (pre recorded webinars that can be watched when opening the page). The challenge is to build reusable components and logics that can be shared between these scenarios.
- When using React for a very interactive application like this, a state management library is required as we quickly realized the basic React state APIs, useState, useEffect, useContext were not scalable at all. So after watching various YouTube videos and Twitch streams (with David), we decided to give xState a shot. State machines in the frontend seemed like a cool concept that mapped well to the states in a webinar. “Webinar not started”, “Webinar is live”, “Webinar has ended”.

## **An Overview of the Solution**

> Describe how the customer was able to use **xState** in their daily workflows to solve their problems. Using the focus area defined in the previous section, dive into how xState directly addresses that focus area.
>
> This section will be the bulk of the case study, so be sure to include as many supporting points pointing to the value of statecharts, xState, and the ability to visualize application logic. Mention any of the Stately tools used by the customer in their solution and in their day-to-day workflows. For example, mention whether the customer leans primarily on the editor, the visualizer, the VS Code extension, or all of them. Determine if the customer uses Stately tools in conjunction with other popular tooling that can be generalized across several different use cases.
>
> Additionally, always include a graphic of their workflow in the form of a statechart adhering to the Stately branding guidelines. It's also important to gain permissions to publish any visual artifacts from the customer.

- When starting with xState, we quickly found a nice pattern to load data from a Rails API and listen for updates using phoenix: (state machine for something simple which uses this pattern, Perhaps chat machine as that includes loading, sending and listening to new messages to decide to scroll to bottom)
- For the webinar state, we use an initial state to determine which state we should first go to: (simplified state machine for webinar state. Include counter). V5 mention how the input API helps us here?

### **Alternatives Considered**

> Briefly describe any other potential solutions the customer may have tried before settling on `xState`, especially if the investigation involves a competing product.
>
> Be sure to list the drawbacks and any reasons why the customer decided to chose xState over the competition. If possible, include any other visuals showing the complexity of other approaches compared to using **xState**.

- React APIs were considered first. But were quickly not scalable (Maybe an example of what code looks like for starting a webinar)
- React-query would be nice to handle to Rails APIs but at the time it looked harder to update this data manually when websocket events were triggered. We found xState invoked promises to be sufficient for our use case for loading data from APIs and didn't need the rendering control that react-query provides.
- Redux was also a possiblity. It provides a global store to manage data, dispatches for updating data from components and ways to select slices of data for performant rerendering. However xstate has all of this. A root machine, sending events to that machine or a machine in the system, and the `useSelector` hook. We find xState offers a more structured and declarative model for handling state transitions and side effects, compared to Redux’s action-reducer pattern.
- Learning xState was a steep learning curve. I don’t believe this was due to xState itself but more for the momentous task we had to build a webinar page from scratch.
- When building features, we found there were many different ways to build the state machine and ways to structure the actors. Explicit states vs context, spawned actor vs parallel states

### **Team Benefits**

> Aim for describing the "quality of life" improvements xState offers alongside the business value delivered. If **xState** or any of our suite of tools makes the customer's job any easier or more enjoyable, be sure to record it here.

- By separating the core code into state machines and actors and only using React for the UI, we are able to quickly identify bugs and build new features.
- Using the stately editor, we can prototype new flows together with our tech lead and designer to make sure the business requirements are met. From there we copy the generated code into our project, build the UI in react and possibly integrate it with other machines in the system.
- For webinars in production, we can label them as debuggable which exposes the root machine in a variable in the console that we can access the system from and send events/subscribe to any machine

### Project location

https://stately.ai/registry/editor/45388f0a-2585-432a-8598-0a946f4621f7?mode=design&machineId=afde01f8-1314-4590-b9be-2fd5dafe90d2
