import * as React from "react";
import { BrowserRouter, Switch, Route, Redirect } from "react-router-dom";

import { Game, Instructions, Home, Credits, Confirmation } from "./views";
import { SettingsStore } from "./store";

function App() {
  return (
    <BrowserRouter basename="/">
      <SettingsStore>
        <Switch>
          <Route exact path="/" component={Home} />
          <Route exact path="/instructions" component={Instructions} />
          <Route exact path="/play" component={Game} />
          <Route exact path="/credits" component={Credits} />
          {/* <Route exact path="/confirmation" component={Confirmation} /> */}
          <Redirect to={"/play"} />
        </Switch>
      </SettingsStore>
    </BrowserRouter>
  );
}

export default App;
