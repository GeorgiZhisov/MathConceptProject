class StateMachine {
    constructor(initialState) {
        this.state = initialState;
    }

    setState(newState) {
        this.state = newState;
    }

    getState() {
        return this.state;
    }
}